import { z } from "zod";
import {
  addCalendarMonths,
  calendarDateSchema,
  formatCalendarMonth,
  getCalendarMonthBounds,
  parseCalendarDate,
} from "@/lib/calendar-values";
import type { OccurrenceStatusValue } from "@/lib/occurrence-status";

export const MAX_TRACKING_RANGE_DAYS = 366;

export type RawTrackingFilters = {
  from?: string;
  to?: string;
  activity?: string | string[];
  status?: string | string[];
};

export type TrackingFilters = {
  from: string;
  to: string;
  activities: string[];
  statuses: OccurrenceStatusValue[];
};

export class TrackingPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackingPeriodError";
  }
}

export function validateTrackingPeriod(raw: RawTrackingFilters, today: string) {
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const hasFrom = raw.from !== undefined;
  const hasTo = raw.to !== undefined;
  if (!hasFrom && !hasTo)
    return {
      from: defaultFrom,
      requestedTo: today,
      to: today,
      usedDefaultPeriod: true,
      toWasLimited: false,
    };
  if (!hasFrom || !hasTo)
    throw new TrackingPeriodError(
      "Informe as datas inicial e final no formato YYYY-MM-DD.",
    );
  const fromResult = calendarDateSchema.safeParse(raw.from);
  const toResult = calendarDateSchema.safeParse(raw.to);
  if (!fromResult.success || !toResult.success)
    throw new TrackingPeriodError(
      "Informe datas existentes no formato YYYY-MM-DD.",
    );
  const from = fromResult.data;
  const requestedTo = toResult.data;
  const to = requestedTo > today ? today : requestedTo;
  if (from > to)
    throw new TrackingPeriodError(
      "A data inicial não pode ser posterior à data final ou ao dia atual.",
    );
  const inclusiveDays =
    Math.round(
      (parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime()) /
        86_400_000,
    ) + 1;
  if (inclusiveDays > MAX_TRACKING_RANGE_DAYS)
    throw new TrackingPeriodError(
      `O acompanhamento aceita no máximo ${MAX_TRACKING_RANGE_DAYS} dias, incluindo as datas inicial e final.`,
    );
  return {
    from,
    requestedTo,
    to,
    usedDefaultPeriod: false,
    toWasLimited: requestedTo > today,
  };
}

export function normalizeTrackingFilters(
  raw: RawTrackingFilters,
  today: string,
  validActivityIds: ReadonlySet<string>,
) {
  const period = validateTrackingPeriod(raw, today);
  const { from, to, usedDefaultPeriod } = period;

  const activities = [
    ...new Set(asArray(raw.activity).filter((id) => validActivityIds.has(id))),
  ].sort();
  const statusSchema = z.enum(["PLANNED", "COMPLETED", "SKIPPED"]);
  const statuses = [
    ...new Set(
      asArray(raw.status).flatMap((value) => {
        const parsed = statusSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ].sort() as OccurrenceStatusValue[];
  return {
    filters: { from, to, activities, statuses } satisfies TrackingFilters,
    period: {
      requestedFrom: raw.from ?? from,
      requestedTo: raw.to ?? today,
      effectiveFrom: from,
      effectiveTo: to,
      today,
      toWasLimited: period.toWasLimited,
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
      completedCount: number;
      plannedMinutes: number;
      investedMinutes: number;
      occurrencesWithoutDuration: number;
    }
  >();
  const monthWeekCounts = [0, 0, 0, 0, 0];
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
      completedCount: 0,
      plannedMinutes: 0,
      investedMinutes: 0,
      occurrencesWithoutDuration: 0,
    };
    current.occurrenceCount += 1;
    if (occurrence.durationMinutes === null)
      current.occurrencesWithoutDuration += 1;
    else current.plannedMinutes += occurrence.durationMinutes;
    if (occurrence.status === "COMPLETED") {
      current.completedCount += 1;
      if (occurrence.durationMinutes !== null)
        current.investedMinutes += occurrence.durationMinutes;
    }
    activityMap.set(occurrence.activity.id, current);

    const dayOfMonth = Number(occurrence.scheduledDate.slice(-2));
    const monthWeekIndex = Math.min(4, Math.floor((dayOfMonth - 1) / 7));
    monthWeekCounts[monthWeekIndex] += 1;
    const month = occurrence.scheduledDate.slice(0, 7);
    monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1);
  }

  const totalCount = occurrences.length;
  const monthWeekFrequency = monthWeekCounts.map((count, index) => ({
    weekNumber: index + 1,
    label: `Semana ${index + 1}`,
    rangeLabel:
      index === 4 ? "dias 29–fim" : `dias ${index * 7 + 1}–${index * 7 + 7}`,
    count,
  }));

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
        b.investedMinutes - a.investedMinutes ||
        a.activityName.localeCompare(b.activityName, "pt-BR") ||
        a.activityId.localeCompare(b.activityId),
    ),
    monthWeekFrequency,
    monthlyFrequency,
  };
}

export function trackingSearchParams(filters: TrackingFilters) {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
  });
  for (const activity of filters.activities)
    params.append("activity", activity);
  for (const status of filters.statuses) params.append("status", status);
  return params.toString();
}

function asArray(value: string | string[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
