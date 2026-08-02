import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import { prisma } from "@/lib/prisma";
import {
  archiveActivity,
  createActivity,
  getActivity,
  reactivateActivity,
  updateActivity,
} from "@/services/activities";
import {
  changeOccurrenceStatus,
  createOccurrence,
  deleteOccurrence,
  updateOccurrence,
} from "@/services/activity-occurrences";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  rescheduleCalendarEvent,
} from "@/services/calendar-events";
import { DomainError } from "@/services/domain-error";

const activityIds: string[] = [];
const occurrenceIds: string[] = [];
const eventIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Os testes de integração exigem o PostgreSQL configurado em DATABASE_URL: ${error instanceof Error ? error.message : "falha desconhecida"}`,
    );
  }
});

afterAll(async () => {
  if (occurrenceIds.length > 0) {
    await prisma.activityOccurrence.deleteMany({
      where: { id: { in: occurrenceIds } },
    });
  }
  if (eventIds.length > 0) {
    await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  }
  if (activityIds.length > 0) {
    await prisma.activity.deleteMany({ where: { id: { in: activityIds } } });
  }
  await prisma.$disconnect();
});

describe.sequential("regras de negócio com PostgreSQL", () => {
  let activityId: string;
  let firstOccurrenceId: string;
  let secondOccurrenceId: string;
  let eventId: string;

  it("cria uma atividade", async () => {
    const activity = await createActivity({
      name: `Teste ${randomUUID()}`,
      color: "#10B981",
      icon: "🧪",
      defaultDurationMinutes: 45,
      defaultStartTime: "08:15",
    });

    activityId = activity.id;
    activityIds.push(activity.id);
    expect(activity.active).toBe(true);
  });

  it("cria duas ocorrências no mesmo dia copiando os padrões", async () => {
    const first = await createOccurrence({
      activityId,
      scheduledDate: "2026-08-03",
      position: 0,
    });
    const second = await createOccurrence({
      activityId,
      scheduledDate: "2026-08-03",
      position: 1,
    });

    firstOccurrenceId = first.id;
    secondOccurrenceId = second.id;
    occurrenceIds.push(first.id, second.id);

    expect(first.durationMinutes).toBe(45);
    expect(serializeLocalTime(first.startTime!)).toBe("08:15");
    expect(serializeCalendarDate(first.scheduledDate)).toBe("2026-08-03");
    expect(second.activityId).toBe(activityId);
  });

  it("preserva snapshots ao alterar os padrões da atividade", async () => {
    await updateActivity(activityId, {
      defaultDurationMinutes: 90,
      defaultStartTime: "10:30",
    });

    const oldOccurrence = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: firstOccurrenceId },
    });
    expect(oldOccurrence.durationMinutes).toBe(45);
    expect(serializeLocalTime(oldOccurrence.startTime!)).toBe("08:15");

    const newOccurrence = await createOccurrence({
      activityId,
      scheduledDate: "2026-08-04",
      position: 0,
    });
    occurrenceIds.push(newOccurrence.id);
    expect(newOccurrence.durationMinutes).toBe(90);
    expect(serializeLocalTime(newOccurrence.startTime!)).toBe("10:30");
  });

  it("edita e reagenda somente a ocorrência selecionada", async () => {
    const updated = await updateOccurrence(secondOccurrenceId, {
      scheduledDate: "2026-08-05",
      startTime: "14:45",
      durationMinutes: 30,
      notes: "Observação do teste",
      position: 2,
    });

    expect(serializeCalendarDate(updated.scheduledDate)).toBe("2026-08-05");
    expect(serializeLocalTime(updated.startTime!)).toBe("14:45");
    expect(updated.durationMinutes).toBe(30);
    expect(updated.position).toBe(2);
  });

  it("arquiva sem apagar ocorrências e bloqueia novos agendamentos", async () => {
    const archived = await archiveActivity(activityId);
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).not.toBeNull();
    expect(
      await prisma.activityOccurrence.count({ where: { activityId } }),
    ).toBeGreaterThan(0);

    await expect(
      createOccurrence({ activityId, scheduledDate: "2026-08-06" }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("reativa a atividade", async () => {
    const activity = await reactivateActivity(activityId);
    expect(activity.active).toBe(true);
    expect(activity.archivedAt).toBeNull();
  });

  it("gerencia conclusão e preserva o timestamp ao concluir novamente", async () => {
    const completed = await changeOccurrenceStatus(
      firstOccurrenceId,
      "COMPLETED",
    );
    expect(completed.completedAt).not.toBeNull();

    const completedAgain = await changeOccurrenceStatus(
      firstOccurrenceId,
      "COMPLETED",
    );
    expect(completedAgain.completedAt?.getTime()).toBe(
      completed.completedAt?.getTime(),
    );

    const planned = await changeOccurrenceStatus(firstOccurrenceId, "PLANNED");
    expect(planned.completedAt).toBeNull();
  });

  it("exclui uma ocorrência sem excluir a atividade", async () => {
    await deleteOccurrence(secondOccurrenceId);
    occurrenceIds.splice(occurrenceIds.indexOf(secondOccurrenceId), 1);

    expect(await getActivity(activityId)).not.toBeNull();
    expect(
      await prisma.activityOccurrence.findUnique({
        where: { id: secondOccurrenceId },
      }),
    ).toBeNull();
  });

  it("impede excluir uma atividade que possui histórico", async () => {
    await expect(
      prisma.activity.delete({ where: { id: activityId } }),
    ).rejects.toThrow();
    expect(await getActivity(activityId)).not.toBeNull();
  });

  it("preserva duração padrão e duração da ocorrência ausentes", async () => {
    const activity = await createActivity({
      name: `Sem duração ${randomUUID()}`,
      color: "#334455",
      defaultDurationMinutes: null,
    });
    activityIds.push(activity.id);
    const occurrence = await createOccurrence({
      activityId: activity.id,
      scheduledDate: "2026-08-09",
      position: 0,
    });
    occurrenceIds.push(occurrence.id);
    expect(activity.defaultDurationMinutes).toBeNull();
    expect(occurrence.durationMinutes).toBeNull();
  });

  it("cria, reagenda e cancela um evento separado das ocorrências", async () => {
    const event = await createCalendarEvent({
      title: `Evento ${randomUUID()}`,
      eventDate: "2026-08-03",
      startTime: "19:30",
      durationMinutes: 60,
    });
    eventId = event.id;
    eventIds.push(event.id);

    expect(serializeCalendarDate(event.eventDate)).toBe("2026-08-03");
    expect(serializeLocalTime(event.startTime!)).toBe("19:30");

    const rescheduled = await rescheduleCalendarEvent(eventId, "2026-08-07");
    expect(serializeCalendarDate(rescheduled.eventDate)).toBe("2026-08-07");

    const cancelled = await cancelCalendarEvent(eventId);
    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.calendarEvent.count({ where: { id: eventId } })).toBe(
      1,
    );
    expect(
      await prisma.activityOccurrence.count({ where: { id: eventId } }),
    ).toBe(0);
  });

  it("exclui somente o evento identificado", async () => {
    const event = await createCalendarEvent({
      title: `Evento descartável ${randomUUID()}`,
      eventDate: "2026-08-08",
    });
    eventIds.push(event.id);
    await deleteCalendarEvent(event.id);
    eventIds.splice(eventIds.indexOf(event.id), 1);
    expect(
      await prisma.calendarEvent.findUnique({ where: { id: event.id } }),
    ).toBeNull();
    expect(await getActivity(activityId)).not.toBeNull();
  });
});
