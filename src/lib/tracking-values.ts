import { z } from "zod";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDateSchema,
  formatCalendarMonth,
  getCalendarMonthBounds,
  normalizeWeekStart,
  parseCalendarDate,
} from "@/lib/calendar-values";
import type { OccurrenceStatusValue } from "@/lib/occurrence-status";

export const TRACKING_PAGE_SIZE = 25;
export type TrackingStatusFilter = "ALL" | OccurrenceStatusValue;

export type RawTrackingFilters = {
  from?: string;
  to?: string;
  activity?: string;
  status?: string;
  page?: string;
};

export type TrackingFilters = {
  from: string;
  to: string;
  activity: string;
  status: TrackingStatusFilter;
  page: number;
};

export function normalizeTrackingFilters(
  raw: RawTrackingFilters,
  today: string,
  validActivityIds: ReadonlySet<string>,
) {
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const datesValid =
    calendarDateSchema.safeParse(raw.from).success &&
    calendarDateSchema.safeParse(raw.to).success;
  let from = datesValid ? raw.from! : defaultFrom;
  let requestedTo = datesValid ? raw.to! : today;
  let to = requestedTo > today ? today : requestedTo;
  let usedDefaultPeriod = !datesValid;
  if (from > to || from > today) {
    from = defaultFrom;
    requestedTo = today;
    to = today;
    usedDefaultPeriod = true;
  }

  const activity =
    raw.activity && raw.activity !== "all" && validActivityIds.has(raw.activity)
      ? raw.activity
      : "all";
  const status = z
    .enum(["ALL", "PLANNED", "COMPLETED", "SKIPPED"])
    .catch("ALL")
    .parse(raw.status ?? "ALL");
  const page = /^[1-9]\d*$/.test(raw.page ?? "") ? Number(raw.page) : 1;

  return {
    filters: { from, to, activity, status, page } satisfies TrackingFilters,
    period: {
      requestedFrom: raw.from ?? defaultFrom,
      requestedTo: raw.to ?? today,
      effectiveFrom: from,
      effectiveTo: to,
      today,
      toWasLimited: datesValid && requestedTo > today,
      usedDefaultPeriod,
    },
  };
}

export type TrackingAnalyticOccurrence = {
  scheduledDate: string;
  durationMinutes: number | null;
  status: OccurrenceStatusValue;
  activity: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
    active: boolean;
  };
};

export function calculateTrackingAnalytics(
  occurrences: readonly TrackingAnalyticOccurrence[],
  from: string,
  to: string,
) {
  const summary = { plannedCount: 0, completedCount: 0, skippedCount: 0 };
  const activityMap = new Map<
    string,
    {
      activityId: string;
      activityName: string;
      color: string;
      icon: string | null;
      archived: boolean;
      occurrenceCount: number;
      plannedMinutes: number;
      occurrencesWithoutDuration: number;
    }
  >();
  const weeklyCounts = new Map<string, number>();
  const monthlyCounts = new Map<string, number>();

  for (const occurrence of occurrences) {
    if (occurrence.status === "PLANNED") summary.plannedCount += 1;
    if (occurrence.status === "COMPLETED") summary.completedCount += 1;
    if (occurrence.status === "SKIPPED") summary.skippedCount += 1;

    const current = activityMap.get(occurrence.activity.id) ?? {
      activityId: occurrence.activity.id,
      activityName: occurrence.activity.name,
      color: occurrence.activity.color,
      icon: occurrence.activity.icon,
      archived: !occurrence.activity.active,
      occurrenceCount: 0,
      plannedMinutes: 0,
      occurrencesWithoutDuration: 0,
    };
    current.occurrenceCount += 1;
    if (occurrence.durationMinutes === null)
      current.occurrencesWithoutDuration += 1;
    else current.plannedMinutes += occurrence.durationMinutes;
    activityMap.set(occurrence.activity.id, current);

    const weekStart = normalizeWeekStart(
      occurrence.scheduledDate,
      occurrence.scheduledDate,
    );
    weeklyCounts.set(weekStart, (weeklyCounts.get(weekStart) ?? 0) + 1);
    const month = occurrence.scheduledDate.slice(0, 7);
    monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1);
  }

  const totalCount = occurrences.length;
  const weeklyFrequency = [];
  for (
    let weekStart = normalizeWeekStart(from, from);
    weekStart <= to;
    weekStart = addCalendarDays(weekStart, 7)
  ) {
    const weekEnd = addCalendarDays(weekStart, 6);
    weeklyFrequency.push({
      weekStart,
      weekEnd,
      effectiveFrom: weekStart < from ? from : weekStart,
      effectiveTo: weekEnd > to ? to : weekEnd,
      partial: weekStart < from || weekEnd > to,
      label: formatTrackingWeek(weekStart, weekEnd),
      count: weeklyCounts.get(weekStart) ?? 0,
    });
  }

  const monthlyFrequency = [];
  for (
    let month = from.slice(0, 7);
    month <= to.slice(0, 7);
    month = addCalendarMonths(month, 1)
  ) {
    const bounds = getCalendarMonthBounds(month);
    monthlyFrequency.push({
      month,
      label: formatCalendarMonth(month),
      partial: from > bounds.firstDay || to < bounds.lastDay,
      count: monthlyCounts.get(month) ?? 0,
    });
  }

  return {
    summary: {
      ...summary,
      totalCount,
      completionRate:
        totalCount === 0 ? null : (summary.completedCount / totalCount) * 100,
    },
    minutesByActivity: [...activityMap.values()].sort(
      (a, b) =>
        b.plannedMinutes - a.plannedMinutes ||
        a.activityName.localeCompare(b.activityName, "pt-BR") ||
        a.activityId.localeCompare(b.activityId),
    ),
    weeklyFrequency,
    monthlyFrequency,
  };
}

const bucketDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

function formatTrackingWeek(start: string, end: string) {
  return `${bucketDateFormatter.format(parseCalendarDate(start))} – ${bucketDateFormatter.format(parseCalendarDate(end))}`;
}

export function trackingSearchParams(
  filters: TrackingFilters,
  page = filters.page,
) {
  return new URLSearchParams({
    from: filters.from,
    to: filters.to,
    activity: filters.activity,
    status: filters.status,
    page: String(page),
  }).toString();
}
