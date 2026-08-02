import { describe, expect, it } from "vitest";
import {
  calculateTrackingAnalytics,
  normalizeTrackingFilters,
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
      activity: "all",
      status: "ALL",
      page: 1,
    });
  });

  it.each([
    ["2026-02-30", "2026-08-20"],
    ["2026-8-01", "2026-08-20"],
    ["2026-08-01T00:00:00Z", "2026-08-20"],
    ["2026-08-01", "inválida"],
  ])("aplica período padrão a %s / %s", (from, to) => {
    expect(
      normalizeTrackingFilters({ from, to }, today, activityIds).filters,
    ).toMatchObject({ from: "2026-08-01", to: "2026-08-20" });
  });

  it("aplica padrão quando a data inicial é posterior à final", () => {
    expect(
      normalizeTrackingFilters(
        { from: "2026-08-15", to: "2026-08-10" },
        today,
        activityIds,
      ).filters,
    ).toMatchObject({ from: "2026-08-01", to: "2026-08-20" });
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

  it("aplica padrão quando todo o período está no futuro", () => {
    expect(
      normalizeTrackingFilters(
        { from: "2026-09-01", to: "2026-09-30" },
        today,
        activityIds,
      ).filters,
    ).toMatchObject({ from: "2026-08-01", to: "2026-08-20" });
  });

  it.each([undefined, "all", "inexistente"])(
    "normaliza atividade %s para todas",
    (activity) => {
      expect(
        normalizeTrackingFilters({ activity }, today, activityIds).filters
          .activity,
      ).toBe("all");
    },
  );

  it("preserva uma atividade existente inclusive se arquivada", () => {
    expect(
      normalizeTrackingFilters({ activity: "activity-2" }, today, activityIds)
        .filters.activity,
    ).toBe("activity-2");
  });

  it.each(["ALL", "PLANNED", "COMPLETED", "SKIPPED"] as const)(
    "aceita o status %s",
    (status) => {
      expect(
        normalizeTrackingFilters({ status }, today, activityIds).filters.status,
      ).toBe(status);
    },
  );

  it.each([undefined, "SCHEDULED", "texto"])(
    "normaliza status inválido %s",
    (status) => {
      expect(
        normalizeTrackingFilters({ status }, today, activityIds).filters.status,
      ).toBe("ALL");
    },
  );

  it.each([
    ["1", 1],
    ["25", 25],
    ["0", 1],
    ["-1", 1],
    ["1.5", 1],
    ["abc", 1],
  ])("normaliza página %s", (page, expected) => {
    expect(
      normalizeTrackingFilters({ page }, today, activityIds).filters.page,
    ).toBe(expected);
  });
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

  it("soma snapshots de duração e conta duração ausente", () => {
    const result = calculateTrackingAnalytics(
      occurrences,
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.minutesByActivity[0]).toMatchObject({
      activityName: "Leitura",
      occurrenceCount: 9,
      plannedMinutes: 345,
      occurrencesWithoutDuration: 0,
    });
    expect(result.minutesByActivity[1]).toMatchObject({
      activityName: "Academia",
      archived: true,
      occurrenceCount: 1,
      plannedMinutes: 0,
      occurrencesWithoutDuration: 1,
    });
  });

  it("preenche semanas vazias e identifica extremidades parciais", () => {
    const result = calculateTrackingAnalytics(
      occurrences,
      "2026-07-01",
      "2026-08-01",
    );
    expect(result.weeklyFrequency[0]).toMatchObject({
      weekStart: "2026-06-29",
      count: 4,
      partial: true,
    });
    expect(result.weeklyFrequency.some(({ count }) => count === 0)).toBe(true);
    expect(result.weeklyFrequency.at(-1)).toMatchObject({
      weekStart: "2026-07-27",
      count: 1,
      partial: true,
    });
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
      trackingSearchParams(
        {
          from: "2026-07-01",
          to: "2026-07-31",
          activity: "activity-1",
          status: "COMPLETED",
          page: 1,
        },
        2,
      ),
    ).toBe(
      "from=2026-07-01&to=2026-07-31&activity=activity-1&status=COMPLETED&page=2",
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
