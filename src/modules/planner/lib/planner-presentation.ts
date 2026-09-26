import type { PlannerOccurrenceDto } from "@/modules/planner/services/weekly-planner";

export function getDefaultSelectedDay(days: string[], today: string) {
  return days.includes(today) ? today : (days[0] ?? "");
}

export function calculateWeekSummary(occurrences: PlannerOccurrenceDto[]) {
  const completed = occurrences.filter(
    (item) => item.status === "COMPLETED",
  ).length;
  const skipped = occurrences.filter(
    (item) => item.status === "SKIPPED",
  ).length;
  const planned = occurrences.length - completed - skipped;
  const percentage =
    occurrences.length === 0
      ? 0
      : Math.round((completed / occurrences.length) * 100);
  const skippedPercentage =
    occurrences.length === 0
      ? 0
      : Math.round((skipped / occurrences.length) * 100);
  return {
    total: occurrences.length,
    planned,
    completed,
    skipped,
    percentage,
    skippedPercentage,
  };
}

export function formatPlannerDay(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      timeZone: "UTC",
    })
      .format(date)
      .replace(".", ""),
    day: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      timeZone: "UTC",
    }).format(date),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
      .format(date)
      .replace(".", ""),
  };
}
