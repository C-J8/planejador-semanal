import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { archiveActivity, createActivity } from "@/services/activities";
import {
  completeOccurrence,
  createOccurrenceAtEnd,
  reopenOccurrence,
  skipOccurrence,
} from "@/services/activity-occurrences";
import { createCalendarEvent } from "@/services/calendar-events";
import { getDailyPlanner } from "@/services/daily-planner";
import { DomainError } from "@/services/domain-error";
import { getWeeklyPlanner } from "@/services/weekly-planner";

const activityIds: string[] = [];
const occurrenceIds: string[] = [];
const eventIds: string[] = [];

beforeAll(async () => void (await prisma.$queryRaw`SELECT 1`));
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

describe.sequential("tela Dia no PostgreSQL", () => {
  const date = "2026-08-17";
  let activityId: string;
  let firstId: string;
  let secondId: string;
  let immutableSnapshot: string;
  let relatedSnapshot: string;

  it("consulta só o dia, ordena ocorrências e separa eventos", async () => {
    const activity = await createActivity({
      name: `Dia ${randomUUID()}`,
      color: "#2563EB",
      icon: "✓",
      defaultDurationMinutes: 35,
      defaultStartTime: "08:15",
    });
    activityId = activity.id;
    activityIds.push(activity.id);
    const first = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: date,
    });
    const second = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: date,
    });
    const outside = await createOccurrenceAtEnd({
      activityId,
      scheduledDate: "2026-08-18",
    });
    firstId = first.id;
    secondId = second.id;
    occurrenceIds.push(first.id, second.id, outside.id);
    const event = await createCalendarEvent({
      title: `Evento ${randomUUID()}`,
      eventDate: date,
      startTime: "09:00",
    });
    const outsideEvent = await createCalendarEvent({
      title: `Evento externo ${randomUUID()}`,
      eventDate: "2026-08-18",
      startTime: "10:00",
    });
    eventIds.push(event.id, outsideEvent.id);
    const immutable = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: first.id },
      select: {
        activityId: true,
        scheduledDate: true,
        startTime: true,
        durationMinutes: true,
        notes: true,
        position: true,
        createdAt: true,
      },
    });
    immutableSnapshot = JSON.stringify(immutable);
    relatedSnapshot = JSON.stringify(
      await Promise.all([
        prisma.activity.findUniqueOrThrow({ where: { id: activityId } }),
        prisma.activityOccurrence.findUniqueOrThrow({
          where: { id: second.id },
        }),
        prisma.activityOccurrence.findUniqueOrThrow({
          where: { id: outside.id },
        }),
        prisma.calendarEvent.findUniqueOrThrow({ where: { id: event.id } }),
        prisma.calendarEvent.findUniqueOrThrow({
          where: { id: outsideEvent.id },
        }),
      ]),
    );
    const planner = await getDailyPlanner(date);
    expect(planner.occurrences.map(({ id }) => id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(planner.occurrences.map(({ id }) => id)).not.toContain(outside.id);
    expect(planner.events.map(({ id }) => id)).toEqual([event.id]);
    expect(planner.events.map(({ id }) => id)).not.toContain(outsideEvent.id);
    expect(planner.summary).toEqual({
      planned: 2,
      completed: 0,
      skipped: 0,
      total: 2,
    });
    expect(JSON.parse(JSON.stringify(planner))).toEqual(planner);
  });

  it("conclui idempotentemente e preserva o primeiro instante", async () => {
    const instant = new Date("2026-08-17T13:45:00.000Z");
    await completeOccurrence(firstId, instant);
    const repeated = await completeOccurrence(
      firstId,
      new Date("2026-08-17T14:00:00.000Z"),
    );
    expect(repeated.completedAt?.toISOString()).toBe(instant.toISOString());
  });

  it("rejeita concluída para pulada sem reabrir", async () => {
    await expect(skipOccurrence(firstId)).rejects.toBeInstanceOf(DomainError);
  });

  it("reabre, limpa conclusão e permite pular idempotentemente", async () => {
    expect(await reopenOccurrence(firstId)).toMatchObject({
      status: "PLANNED",
      completedAt: null,
    });
    await skipOccurrence(firstId);
    expect(await skipOccurrence(firstId)).toMatchObject({
      status: "SKIPPED",
      completedAt: null,
    });
    await expect(completeOccurrence(firstId)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("reflete os estados no dia e semana sem alterar a ordem", async () => {
    const daily = await getDailyPlanner(date);
    const weekly = await getWeeklyPlanner("2026-08-17");
    expect(daily.summary).toEqual({
      planned: 1,
      completed: 0,
      skipped: 1,
      total: 2,
    });
    expect(daily.occurrences.map(({ position }) => position)).toEqual([0, 1]);
    expect(weekly.occurrences.find(({ id }) => id === firstId)?.status).toBe(
      "SKIPPED",
    );
    expect(weekly.occurrences.find(({ id }) => id === secondId)?.status).toBe(
      "PLANNED",
    );
  });

  it("preserva planejamento, atividade, outras ocorrências e eventos", async () => {
    const immutable = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: firstId },
      select: {
        activityId: true,
        scheduledDate: true,
        startTime: true,
        durationMinutes: true,
        notes: true,
        position: true,
        createdAt: true,
      },
    });
    expect(JSON.stringify(immutable)).toBe(immutableSnapshot);

    const related = await Promise.all([
      prisma.activity.findUniqueOrThrow({ where: { id: activityId } }),
      prisma.activityOccurrence.findUniqueOrThrow({
        where: { id: secondId },
      }),
      prisma.activityOccurrence.findUniqueOrThrow({
        where: { id: occurrenceIds[2] },
      }),
      prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventIds[0] } }),
      prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventIds[1] } }),
    ]);
    expect(JSON.stringify(related)).toBe(relatedSnapshot);
  });

  it("resolve transições concorrentes sem sobrescrever outro resultado", async () => {
    const results = await Promise.allSettled([
      completeOccurrence(secondId),
      skipOccurrence(secondId),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const persisted = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: secondId },
    });
    expect(["COMPLETED", "SKIPPED"]).toContain(persisted.status);
    await reopenOccurrence(secondId);
  });

  it("executa e exibe ocorrência após arquivar a atividade", async () => {
    await archiveActivity(activityId);
    expect((await reopenOccurrence(firstId)).status).toBe("PLANNED");
    const daily = await getDailyPlanner(date);
    expect(
      daily.occurrences.find(({ id }) => id === firstId)?.activity.active,
    ).toBe(false);
  });

  it("valida UUID e ocorrência inexistente", async () => {
    await expect(completeOccurrence("inválido")).rejects.toBeTruthy();
    await expect(completeOccurrence(randomUUID())).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
