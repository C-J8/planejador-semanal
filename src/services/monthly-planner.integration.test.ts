import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { archiveActivity, createActivity } from "@/services/activities";
import {
  completeOccurrence,
  createOccurrenceAtEnd,
  moveOccurrence,
  skipOccurrence,
} from "@/services/activity-occurrences";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
} from "@/services/calendar-events";
import { getMonthlyPlanner } from "@/services/monthly-planner";

const activityIds: string[] = [];
const occurrenceIds: string[] = [];
const eventIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Os testes mensais exigem PostgreSQL disponível: ${error instanceof Error ? error.message : "falha desconhecida"}`,
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

describe.sequential("visão mensal no PostgreSQL", () => {
  const month = "2026-07";
  let activityId: string;
  let plannedId: string;
  let completedId: string;
  let skippedId: string;
  let eventToMoveId: string;
  let recordsSnapshot: string;

  it("cria dados exclusivos nos limites e fora da grade", async () => {
    const activity = await createActivity({
      name: `Mensal ${randomUUID()}`,
      color: "#0F766E",
      icon: "M",
      defaultDurationMinutes: 40,
      defaultStartTime: "07:30",
    });
    activityId = activity.id;
    activityIds.push(activity.id);

    const inputs = [
      ["2026-06-29", "limite inicial"],
      ["2026-07-15", "primeira no dia"],
      ["2026-07-15", "segunda no dia"],
      ["2026-08-02", "limite final"],
      ["2026-06-28", "antes da grade"],
      ["2026-08-03", "depois da grade"],
    ] as const;
    const occurrences = [];
    for (const [scheduledDate, notes] of inputs) {
      const occurrence = await createOccurrenceAtEnd({
        activityId,
        scheduledDate,
        notes,
      });
      occurrences.push(occurrence);
      occurrenceIds.push(occurrence.id);
    }
    plannedId = occurrences[0].id;
    completedId = occurrences[1].id;
    skippedId = occurrences[2].id;
    await completeOccurrence(completedId, new Date("2026-07-15T12:00:00.000Z"));
    await skipOccurrence(skippedId);

    for (const [eventDate, title] of [
      ["2026-06-29", "Evento inicial"],
      ["2026-07-15", "Evento interno"],
      ["2026-08-02", "Evento final"],
      ["2026-06-28", "Evento anterior"],
      ["2026-08-03", "Evento posterior"],
    ] as const) {
      const event = await createCalendarEvent({
        title: `${title} ${randomUUID()}`,
        eventDate,
        startTime: title === "Evento interno" ? "09:00" : "08:00",
      });
      eventIds.push(event.id);
      if (title === "Evento interno") eventToMoveId = event.id;
    }
    await cancelCalendarEvent(eventIds[2]);

    recordsSnapshot = JSON.stringify(
      await Promise.all([
        prisma.activity.findUniqueOrThrow({ where: { id: activityId } }),
        prisma.activityOccurrence.findMany({
          where: { id: { in: occurrenceIds } },
          orderBy: { id: "asc" },
        }),
        prisma.calendarEvent.findMany({
          where: { id: { in: eventIds } },
          orderBy: { id: "asc" },
        }),
      ]),
    );
  });

  it("limita a consulta à grade e inclui seus dois extremos", async () => {
    const planner = await getMonthlyPlanner(month, "2026-07-15");
    expect(planner).toMatchObject({
      month,
      monthLabel: "julho de 2026",
      gridStart: "2026-06-29",
      gridEnd: "2026-08-02",
      isCurrentMonth: true,
    });
    const ids = planner.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.occurrences.map(({ id }) => id)),
    );
    expect(ids).toContain(plannedId);
    expect(ids).toContain(occurrenceIds[3]);
    expect(ids).not.toContain(occurrenceIds[4]);
    expect(ids).not.toContain(occurrenceIds[5]);
  });

  it("mantém datas adjacentes, estados e ordem por posição", async () => {
    const planner = await getMonthlyPlanner(month, "2026-07-15");
    const days = planner.weeks.flatMap((week) => week.days);
    expect(days).toHaveLength(35);
    expect(days[0]).toMatchObject({
      date: "2026-06-29",
      belongsToSelectedMonth: false,
    });
    expect(days.at(-1)).toMatchObject({
      date: "2026-08-02",
      belongsToSelectedMonth: false,
    });
    const selectedDay = days.find(({ date }) => date === "2026-07-15")!;
    expect(selectedDay.isToday).toBe(true);
    expect(selectedDay.occurrences.map(({ id }) => id)).toEqual([
      completedId,
      skippedId,
    ]);
    expect(selectedDay.occurrences.map(({ status }) => status)).toEqual([
      "COMPLETED",
      "SKIPPED",
    ]);
    expect(days[0].occurrences[0].status).toBe("PLANNED");
  });

  it("separa e limita eventos, incluindo agendado e cancelado", async () => {
    const planner = await getMonthlyPlanner(month, "2026-07-15");
    const days = planner.weeks.flatMap((week) => week.days);
    const visibleEvents = days.flatMap((day) => day.events);
    expect(visibleEvents.map(({ id }) => id)).toEqual(
      expect.arrayContaining([eventIds[0], eventIds[1], eventIds[2]]),
    );
    expect(visibleEvents.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([eventIds[3], eventIds[4]]),
    );
    expect(visibleEvents.find(({ id }) => id === eventIds[2])?.status).toBe(
      "CANCELLED",
    );
    expect(
      days.find(({ date }) => date === "2026-07-15")?.events[0],
    ).toMatchObject({
      id: eventToMoveId,
      startTime: "09:00",
      status: "SCHEDULED",
    });
    expect(JSON.parse(JSON.stringify(planner))).toEqual(planner);
  });

  it("não altera nenhum registro durante a consulta", async () => {
    await getMonthlyPlanner(month, "2026-07-15");
    const after = await Promise.all([
      prisma.activity.findUniqueOrThrow({ where: { id: activityId } }),
      prisma.activityOccurrence.findMany({
        where: { id: { in: occurrenceIds } },
        orderBy: { id: "asc" },
      }),
      prisma.calendarEvent.findMany({
        where: { id: { in: eventIds } },
        orderBy: { id: "asc" },
      }),
    ]);
    expect(JSON.stringify(after)).toBe(recordsSnapshot);
  });

  it("reflete status diário e movimentação semanal em nova consulta", async () => {
    await completeOccurrence(plannedId, new Date("2026-07-01T11:00:00.000Z"));
    await moveOccurrence({
      occurrenceId: skippedId,
      targetDate: "2026-07-16",
      targetIndex: 0,
    });
    const planner = await getMonthlyPlanner(month, "2026-07-15");
    const days = planner.weeks.flatMap((week) => week.days);
    expect(days[0].occurrences[0].status).toBe("COMPLETED");
    expect(
      days
        .find(({ date }) => date === "2026-07-15")
        ?.occurrences.map(({ id }) => id),
    ).not.toContain(skippedId);
    expect(
      days.find(({ date }) => date === "2026-07-16")?.occurrences[0],
    ).toMatchObject({ id: skippedId, date: "2026-07-16", status: "SKIPPED" });
  });

  it("reflete reagendamento e cancelamento do evento", async () => {
    await updateCalendarEvent(eventToMoveId, {
      eventDate: "2026-07-16",
      startTime: "10:30",
    });
    await cancelCalendarEvent(eventToMoveId);
    const planner = await getMonthlyPlanner(month, "2026-07-15");
    const days = planner.weeks.flatMap((week) => week.days);
    expect(
      days
        .find(({ date }) => date === "2026-07-15")
        ?.events.map(({ id }) => id),
    ).not.toContain(eventToMoveId);
    expect(
      days.find(({ date }) => date === "2026-07-16")?.events[0],
    ).toMatchObject({
      id: eventToMoveId,
      date: "2026-07-16",
      startTime: "10:30",
      status: "CANCELLED",
    });
  });

  it("mantém ocorrências visíveis depois de arquivar a atividade", async () => {
    await archiveActivity(activityId);
    const planner = await getMonthlyPlanner(month, "2026-07-15");
    const occurrences = planner.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.occurrences),
    );
    expect(
      occurrences.find(({ id }) => id === plannedId)?.activity.active,
    ).toBe(false);
  });

  it("preserva as atividades do seed", async () => {
    const seed = await prisma.activity.findMany({
      where: { name: { in: ["Academia", "Leitura", "Sono"] } },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    expect(seed.map(({ name }) => name)).toEqual([
      "Academia",
      "Leitura",
      "Sono",
    ]);
  });
});
