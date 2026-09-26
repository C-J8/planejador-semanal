import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import {
  archiveActivity,
  createActivity,
} from "@/modules/activities/services/activities";
import {
  completeOccurrence,
  createOccurrenceAtEnd,
  deleteOccurrence,
  moveOccurrence,
  skipOccurrence,
} from "@/modules/planner/services/activity-occurrences";
import {
  cancelCalendarEvent,
  createCalendarEvent,
} from "@/modules/planner/services/calendar-events";
import { getTrackingDashboard } from "@/modules/tracking/services/tracking-dashboard";

const activityIds: string[] = [];
const occurrenceIds: string[] = [];
const eventIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Os testes de acompanhamento exigem PostgreSQL disponível: ${error instanceof Error ? error.message : "falha desconhecida"}`,
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

describe.sequential("acompanhamento no PostgreSQL", () => {
  const today = "2026-08-01";
  const from = "2026-07-01";
  const to = "2026-07-31";
  let primaryActivityId: string;
  let occurrenceToMoveId: string;
  let occurrenceToDeleteId: string;
  let plannedToCompleteId: string;

  it("cria universo exclusivo com três estados, limites, futuro e eventos", async () => {
    const primary = await createActivity({
      name: `Acompanhamento principal ${randomUUID()}`,
      color: "#2563EB",
      icon: "A",
      defaultDurationMinutes: 30,
      defaultStartTime: "08:00",
    });
    const secondary = await createActivity({
      name: `Acompanhamento secundário ${randomUUID()}`,
      color: "#7C3AED",
      icon: "B",
      defaultDurationMinutes: 20,
    });
    primaryActivityId = primary.id;
    activityIds.push(primary.id, secondary.id);

    for (let index = 0; index < 10; index += 1) {
      const occurrence = await createOccurrenceAtEnd({
        activityId: primary.id,
        scheduledDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
        durationMinutes: index === 0 ? 60 : 30,
        notes: `Principal ${index}`,
      });
      occurrenceIds.push(occurrence.id);
      if (index === 0) plannedToCompleteId = occurrence.id;
      if (index === 9) occurrenceToMoveId = occurrence.id;
      if (index >= 4 && index <= 8)
        await completeOccurrence(
          occurrence.id,
          new Date(
            `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
          ),
        );
      if (index === 9) await skipOccurrence(occurrence.id);
    }
    for (let index = 0; index < 16; index += 1) {
      const occurrence = await createOccurrenceAtEnd({
        activityId: secondary.id,
        scheduledDate: `2026-07-${String((index % 8) + 12).padStart(2, "0")}`,
        durationMinutes: 20,
        notes: `Secundária ${index}`,
      });
      occurrenceIds.push(occurrence.id);
      if (index === 0) occurrenceToDeleteId = occurrence.id;
    }
    for (const scheduledDate of ["2026-06-30", "2026-08-01", "2026-08-02"]) {
      const occurrence = await createOccurrenceAtEnd({
        activityId: primary.id,
        scheduledDate,
      });
      occurrenceIds.push(occurrence.id);
    }

    const scheduledEvent = await createCalendarEvent({
      title: `Evento agendado ${randomUUID()}`,
      eventDate: "2026-07-10",
    });
    const cancelledEvent = await createCalendarEvent({
      title: `Evento cancelado ${randomUUID()}`,
      eventDate: "2026-07-10",
    });
    eventIds.push(scheduledEvent.id, cancelledEvent.id);
    await cancelCalendarEvent(cancelledEvent.id);
  });

  it("aplica limites inclusivos e exclui período externo e futuro", async () => {
    const dashboard = await getTrackingDashboard({ from, to }, today);
    expect(dashboard.summary.totalCount).toBe(26);

    const throughToday = await getTrackingDashboard(
      { from, to: today, activity: primaryActivityId },
      today,
    );
    expect(throughToday.summary.totalCount).toBe(11);
  });

  it("calcula o cenário 4/5/1, taxa e minutos usando snapshots", async () => {
    const dashboard = await getTrackingDashboard(
      { from, to, activity: primaryActivityId },
      today,
    );
    expect(dashboard.summary).toEqual({
      plannedCount: 4,
      completedCount: 5,
      skippedCount: 1,
      totalCount: 10,
      completionRate: 50,
    });
    expect(dashboard.minutesByActivity).toHaveLength(1);
    expect(dashboard.minutesByActivity[0]).toMatchObject({
      activityId: primaryActivityId,
      occurrenceCount: 10,
      completedCount: 5,
      plannedMinutes: 330,
      investedMinutes: 150,
      occurrencesWithoutDuration: 0,
    });
  });

  it.each([
    ["PLANNED", 4],
    ["COMPLETED", 5],
    ["SKIPPED", 1],
  ] as const)("filtra o status %s no banco", async (status, total) => {
    const dashboard = await getTrackingDashboard(
      { from, to, activity: primaryActivityId, status },
      today,
    );
    expect(dashboard.summary.totalCount).toBe(total);
  });

  it("normaliza atividade inexistente e mantém eventos fora dos resultados", async () => {
    const all = await getTrackingDashboard({ from, to }, today);
    const invalid = await getTrackingDashboard(
      { from, to, activity: randomUUID() },
      today,
    );
    expect(invalid.filters.activities).toEqual([]);
    expect(invalid.summary).toEqual(all.summary);
  });

  it("preenche as semanas do mês e os meses vazios", async () => {
    const dashboard = await getTrackingDashboard(
      {
        from: "2026-06-01",
        to,
        activity: primaryActivityId,
        status: "COMPLETED",
      },
      today,
    );
    expect(dashboard.monthWeekFrequency.map(({ count }) => count)).toEqual([
      3, 2, 0, 0, 0,
    ]);
    expect(
      dashboard.monthlyFrequency.map(({ month, count }) => [month, count]),
    ).toEqual([
      ["2026-06", 0],
      ["2026-07", 5],
    ]);
  });

  it("reflete conclusão diária, movimentação semanal e exclusão", async () => {
    await completeOccurrence(
      plannedToCompleteId,
      new Date("2026-07-01T14:00:00.000Z"),
    );
    await moveOccurrence({
      occurrenceId: occurrenceToMoveId,
      targetDate: "2026-07-20",
      targetIndex: 0,
    });
    await deleteOccurrence(occurrenceToDeleteId);
    occurrenceIds.splice(occurrenceIds.indexOf(occurrenceToDeleteId), 1);

    const dashboard = await getTrackingDashboard({ from, to }, today);
    expect(dashboard.summary).toMatchObject({
      plannedCount: 18,
      completedCount: 6,
      skippedCount: 1,
      totalCount: 25,
    });
    expect(
      await prisma.activityOccurrence.findUnique({
        where: { id: occurrenceToDeleteId },
      }),
    ).toBeNull();
    expect(
      await prisma.activityOccurrence.findUnique({
        where: { id: occurrenceToMoveId },
      }),
    ).toMatchObject({ status: "SKIPPED" });
  });

  it("preserva histórico após arquivar e mantém DTO serializável", async () => {
    await archiveActivity(primaryActivityId);
    const dashboard = await getTrackingDashboard(
      { from, to, activity: primaryActivityId },
      today,
    );
    expect(dashboard.summary.totalCount).toBe(10);
    expect(
      dashboard.activityOptions.find(({ id }) => id === primaryActivityId),
    ).toMatchObject({
      archived: true,
    });
    expect(JSON.parse(JSON.stringify(dashboard))).toEqual(dashboard);
  });

  it("preserva as três atividades do seed", async () => {
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
