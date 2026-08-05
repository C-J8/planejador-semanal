import { describe, expect, it } from "vitest";
import {
  calculateTrackingAnalytics,
  MAX_TRACKING_RANGE_DAYS,
  normalizeTrackingFilters,
  TrackingPeriodError,
  trackingSearchParams,
  type TrackingAnalyticOccurrence,
} from "@/lib/tracking-values";

const activityIds = new Set(["activity-1", "activity-2"]);

describe("normalização dos filtros de acompanhamento", () => {
  const today = "2026-08-20";

  it("usa o primeiro dia do mês até hoje por padrão", () => {
    expect(normalizeTrackingFilters({}, today, activityIds).filters).toEqual({
      from: "2026-08-01",
      to: "2026-08-20",
      activities: [],
      statuses: [],
    });
  });

  it.each([
    ["2026-02-30", "2026-08-20"],
    ["2026-8-01", "2026-08-20"],
    ["2026-08-01T00:00:00Z", "2026-08-20"],
    ["2026-08-01", "inválida"],
  ])("rejeita o período inválido %s / %s", (from, to) => {
    expect(() =>
      normalizeTrackingFilters({ from, to }, today, activityIds),
    ).toThrow(TrackingPeriodError);
  });

  it("rejeita quando a data inicial é posterior à final", () => {
    expect(() =>
      normalizeTrackingFilters(
        { from: "2026-08-15", to: "2026-08-10" },
        today,
        activityIds,
      ),
    ).toThrow(TrackingPeriodError);
  });

  it("limita a data final futura ao dia atual", () => {
    const result = normalizeTrackingFilters(
      { from: "2026-08-01", to: "2026-09-30" },
      today,
      activityIds,
    );
    expect(result.filters.to).toBe(today);
    expect(result.period.toWasLimited).toBe(true);
  });

  it("rejeita quando todo o período está no futuro", () => {
    expect(() =>
      normalizeTrackingFilters(
        { from: "2026-09-01", to: "2026-09-30" },
        today,
        activityIds,
      ),
    ).toThrow(TrackingPeriodError);
  });

  it("rejeita somente uma das datas presente", () => {
    expect(() =>
      normalizeTrackingFilters({ from: "2026-08-01" }, today, activityIds),
    ).toThrow(TrackingPeriodError);
  });

  it("aceita 366 dias inclusivos e rejeita 367", () => {
    expect(MAX_TRACKING_RANGE_DAYS).toBe(366);
    expect(
      normalizeTrackingFilters(
        { from: "2025-08-20", to: "2026-08-20" },
        today,
        activityIds,
      ).filters,
    ).toMatchObject({ from: "2025-08-20", to: "2026-08-20" });
    expect(() =>
      normalizeTrackingFilters(
        { from: "2025-08-19", to: "2026-08-20" },
        today,
        activityIds,
      ),
    ).toThrow(TrackingPeriodError);
  });

  it.each([undefined, "all", "inexistente"])(
    "normaliza atividade %s para todas",
    (activity) => {
      expect(
        normalizeTrackingFilters({ activity }, today, activityIds).filters
          .activities,
      ).toEqual([]);
    },
  );

  it("preserva uma atividade existente inclusive se arquivada", () => {
    expect(
      normalizeTrackingFilters({ activity: "activity-2" }, today, activityIds)
        .filters.activities,
    ).toEqual(["activity-2"]);
  });

  it("preserva várias atividades válidas", () => {
    expect(
      normalizeTrackingFilters(
        { activity: ["activity-2", "activity-1"] },
        today,
        activityIds,
      ).filters.activities,
    ).toEqual(["activity-1", "activity-2"]);
  });

  it.each(["ALL", "PLANNED", "COMPLETED", "SKIPPED"] as const)(
    "aceita o status %s",
    (status) => {
      expect(
        normalizeTrackingFilters({ status }, today, activityIds).filters
          .statuses,
      ).toEqual(status === "ALL" ? [] : [status]);
    },
  );

  it.each([undefined, "SCHEDULED", "texto"])(
    "normaliza status inválido %s",
    (status) => {
      expect(
        normalizeTrackingFilters({ status }, today, activityIds).filters
          .statuses,
      ).toEqual([]);
    },
  );
});

describe("indicadores compartilhados", () => {
  const occurrences: TrackingAnalyticOccurrence[] = [
    ...Array.from({ length: 4 }, () =>
      occurrence("2026-07-02", "PLANNED", 30, "activity-1", "Leitura"),
    ),
    ...Array.from({ length: 5 }, () =>
      occurrence("2026-07-15", "COMPLETED", 45, "activity-1", "Leitura"),
    ),
    occurrence("2026-08-01", "SKIPPED", null, "activity-2", "Academia", false),
  ];

  it("calcula o cenário obrigatório e a taxa sem arredondamento prematuro", () => {
    const result = calculateTrackingAnalytics(
      occurrences,
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.summary).toEqual({
      plannedCount: 4,
      completedCount: 5,
      skippedCount: 1,
      totalCount: 10,
      completionRate: 50,
    });
  });

  it("representa ausência de dados sem taxa real", () => {
    expect(
      calculateTrackingAnalytics([], "2026-07-01", "2026-07-31").summary,
    ).toMatchObject({ totalCount: 0, completionRate: null });
  });

  it("soma o tempo das ocorrências concluídas", () => {
    const result = calculateTrackingAnalytics(
      occurrences,
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.minutesByActivity[0]).toMatchObject({
      activityName: "Leitura",
      occurrenceCount: 9,
      completedCount: 5,
      plannedMinutes: 345,
      investedMinutes: 225,
      occurrencesWithoutDuration: 0,
    });
    expect(result.minutesByActivity[1]).toMatchObject({
      activityName: "Academia",
      occurrenceCount: 1,
      completedCount: 0,
      plannedMinutes: 0,
      investedMinutes: 0,
      occurrencesWithoutDuration: 1,
    });
  });

  it("compara as cinco semanas fixas do mês", () => {
    const result = calculateTrackingAnalytics(
      occurrences,
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.monthWeekFrequency.map(({ count }) => count)).toEqual([
      5, 0, 5, 0, 0,
    ]);
    expect(
      result.monthWeekFrequency.map(({ weekNumber }) => weekNumber),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("preenche meses cronologicamente inclusive na mudança de ano", () => {
    const result = calculateTrackingAnalytics(
      [occurrence("2025-12-15", "PLANNED")],
      "2025-12-15",
      "2026-02-10",
    );
    expect(
      result.monthlyFrequency.map(({ month, count }) => [month, count]),
    ).toEqual([
      ["2025-12", 1],
      ["2026-01", 0],
      ["2026-02", 0],
    ]);
    expect(result.monthlyFrequency.map(({ partial }) => partial)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("serializa todos os filtros nos links de paginação", () => {
    expect(
      trackingSearchParams({
        from: "2026-07-01",
        to: "2026-07-31",
        activities: ["activity-1"],
        statuses: ["COMPLETED"],
      }),
    ).toBe(
      "from=2026-07-01&to=2026-07-31&activity=activity-1&status=COMPLETED",
    );
  });
});

function occurrence(
  scheduledDate: string,
  status: TrackingAnalyticOccurrence["status"],
  durationMinutes: number | null = 30,
  activityId = "activity-1",
  activityName = "Leitura",
  active = true,
): TrackingAnalyticOccurrence {
  return {
    scheduledDate,
    status,
    durationMinutes,
    activity: {
      id: activityId,
      name: activityName,
      color: "#2563EB",
      icon: null,
      active,
    },
  };
}
