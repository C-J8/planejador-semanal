import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  serializeCalendarDate,
  serializeLocalTime,
} from "@/shared/lib/calendar-values";
import { prisma } from "@/shared/lib/prisma";
import {
  archiveActivity,
  createActivity,
  updateActivity,
} from "@/modules/activities/services/activities";
import {
  changeOccurrenceStatus,
  createOccurrenceAtEnd,
  deleteOccurrence,
  editOccurrence,
  moveOccurrence,
} from "@/modules/planner/services/activity-occurrences";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
} from "@/modules/planner/services/calendar-events";
import { DomainError } from "@/shared/lib/domain-error";
import { getWeeklyPlanner } from "@/modules/planner/services/weekly-planner";

const activityIds: string[] = [];
const occurrenceIds: string[] = [];
const eventIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Os testes semanais exigem PostgreSQL disponível: ${error instanceof Error ? error.message : "falha desconhecida"}`,
    );
  }
});

afterAll(async () => {
  if (occurrenceIds.length)
    await prisma.activityOccurrence.deleteMany({
      where: { id: { in: occurrenceIds } },
    });
  if (eventIds.length)
    await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  if (activityIds.length)
    await prisma.activity.deleteMany({ where: { id: { in: activityIds } } });
  await prisma.$disconnect();
});

describe.sequential("planejador semanal no PostgreSQL", () => {
  const weekStart = "2026-08-03";
  const monday = "2026-08-03";
  const tuesday = "2026-08-04";
  let activityId: string;
  let firstId: string;
  let secondId: string;
  let thirdId: string;
  let eventId: string;

  it("cria atividade e ocorrências distintas no fim do dia com snapshot", async () => {
    const activity = await createActivity({
      name: `Planejador ${randomUUID()}`,
      color: "#F97316",
      icon: "🗓️",
      defaultDurationMinutes: 45,
      defaultStartTime: "18:30",
    });
    activityId = activity.id;
    activityIds.push(activity.id);

    const first = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: monday,
    });
    const second = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: monday,
    });
    const third = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: monday,
    });
    [firstId, secondId, thirdId] = [first.id, second.id, third.id];
    occurrenceIds.push(first.id, second.id, third.id);

    expect([first.position, second.position, third.position]).toEqual([
      0, 1, 2,
    ]);
    expect(first.durationMinutes).toBe(45);
    expect(serializeLocalTime(first.startTime!)).toBe("18:30");
  });

  it("consulta somente os sete dias e apenas atividades ativas na biblioteca", async () => {
    const outside = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: "2026-08-10",
    });
    occurrenceIds.push(outside.id);

    const planner = await getWeeklyPlanner(weekStart);
    expect(planner.days).toHaveLength(7);
    expect(planner.occurrences.map(({ id }) => id)).toEqual(
      expect.arrayContaining([firstId, secondId, thirdId]),
    );
    expect(planner.occurrences.map(({ id }) => id)).not.toContain(outside.id);
    expect(planner.activities.map(({ id }) => id)).toContain(activityId);
  });

  it("reordena no mesmo dia e persiste posições normalizadas", async () => {
    await moveOccurrence({
      occurrenceId: thirdId,
      targetDate: monday,
      targetIndex: 0,
    });
    const planner = await getWeeklyPlanner(weekStart);
    const mondayItems = planner.occurrences.filter(
      ({ date }) => date === monday,
    );
    expect(mondayItems.map(({ id }) => id)).toEqual([
      thirdId,
      firstId,
      secondId,
    ]);
    expect(mondayItems.map(({ position }) => position).sort()).toEqual([
      0, 1, 2,
    ]);
  });

  it("move entre dias e normaliza origem e destino", async () => {
    await moveOccurrence({
      occurrenceId: secondId,
      targetDate: tuesday,
      targetIndex: 0,
    });
    const planner = await getWeeklyPlanner(weekStart);
    expect(
      planner.occurrences
        .filter(({ date }) => date === monday)
        .map(({ position }) => position),
    ).toEqual([0, 1]);
    const moved = planner.occurrences.find(({ id }) => id === secondId)!;
    expect(moved.date).toBe(tuesday);
    expect(moved.position).toBe(0);
    expect(moved.durationMinutes).toBe(45);
  });

  it("edita somente a ocorrência e preserva status, conclusão e snapshot", async () => {
    const completed = await changeOccurrenceStatus(firstId, "COMPLETED");
    await updateActivity(activityId, {
      defaultDurationMinutes: 90,
      defaultStartTime: "20:00",
    });
    const edited = await editOccurrence(firstId, {
      scheduledDate: monday,
      startTime: "19:15",
      durationMinutes: 75,
      notes: "Treino editado",
    });
    expect(edited.durationMinutes).toBe(75);
    expect(serializeLocalTime(edited.startTime!)).toBe("19:15");
    expect(edited.status).toBe("COMPLETED");
    expect(edited.completedAt?.getTime()).toBe(
      completed.completedAt?.getTime(),
    );

    const untouched = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: thirdId },
    });
    expect(untouched.durationMinutes).toBe(45);
    expect(serializeLocalTime(untouched.startTime!)).toBe("18:30");
  });

  it("mantém ocorrências visíveis após arquivar e rejeita novas", async () => {
    await archiveActivity(activityId);
    await expect(
      createOccurrenceAtEnd({ activityId, scheduledDate: monday }),
    ).rejects.toBeInstanceOf(DomainError);
    const planner = await getWeeklyPlanner(weekStart);
    expect(planner.activities.map(({ id }) => id)).not.toContain(activityId);
    expect(planner.occurrences.map(({ id }) => id)).toContain(firstId);
  });

  it("exclui só uma ocorrência e compacta as posições", async () => {
    await deleteOccurrence(thirdId);
    occurrenceIds.splice(occurrenceIds.indexOf(thirdId), 1);
    const planner = await getWeeklyPlanner(weekStart);
    const mondayItems = planner.occurrences.filter(
      ({ date }) => date === monday,
    );
    expect(mondayItems.map(({ position }) => position).sort()).toEqual([0]);
    expect(
      await prisma.activity.findUnique({ where: { id: activityId } }),
    ).not.toBeNull();
  });

  it("cria evento separado sem alterar posições de ocorrências", async () => {
    const before = await prisma.activityOccurrence.findMany({
      where: { id: { in: [firstId, secondId] } },
      select: { id: true, position: true },
      orderBy: { id: "asc" },
    });
    const event = await createCalendarEvent({
      title: `Consulta ${randomUUID()}`,
      eventDate: "2026-08-05",
      startTime: "09:45",
      durationMinutes: 60,
      description: "Evento temporário",
    });
    eventId = event.id;
    eventIds.push(event.id);

    const planner = await getWeeklyPlanner(weekStart);
    expect(planner.events.map(({ id }) => id)).toContain(event.id);
    expect(planner.occurrences.map(({ id }) => id)).not.toContain(event.id);
    expect(serializeCalendarDate(event.eventDate)).toBe("2026-08-05");
    expect(serializeLocalTime(event.startTime!)).toBe("09:45");
    const after = await prisma.activityOccurrence.findMany({
      where: { id: { in: [firstId, secondId] } },
      select: { id: true, position: true },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  });

  it("edita, reagenda e cancela o evento sem apagá-lo", async () => {
    const updated = await updateCalendarEvent(eventId, {
      title: "Consulta reagendada",
      eventDate: "2026-08-06",
      startTime: "10:15",
      durationMinutes: 30,
      description: "Atualizado",
    });
    expect(serializeCalendarDate(updated.eventDate)).toBe("2026-08-06");
    expect(serializeLocalTime(updated.startTime!)).toBe("10:15");

    await cancelCalendarEvent(eventId);
    const cancelledAgain = await cancelCalendarEvent(eventId);
    expect(cancelledAgain.status).toBe("CANCELLED");
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: eventId } }),
    ).not.toBeNull();
  });

  it("preserva as três atividades do seed", async () => {
    const seed = await prisma.activity.findMany({
      where: { name: { in: ["Academia", "Leitura", "Sono"] } },
      select: { name: true },
    });
    expect(seed.map(({ name }) => name).sort()).toEqual([
      "Academia",
      "Leitura",
      "Sono",
    ]);
  });
});
