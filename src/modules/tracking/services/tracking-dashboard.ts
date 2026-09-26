import type { Prisma } from "@/generated/prisma/client";
import {
  parseCalendarDate,
  serializeCalendarDate,
} from "@/shared/lib/calendar-values";
import {
  calculateTrackingAnalytics,
  normalizeTrackingFilters,
  validateTrackingPeriod,
  type RawTrackingFilters,
  type TrackingAnalyticOccurrence,
} from "@/modules/tracking/lib/tracking-values";
import { prisma } from "@/shared/lib/prisma";

export async function getTrackingDashboard(
  rawFilters: RawTrackingFilters,
  today: string,
) {
  validateTrackingPeriod(rawFilters, today);
  const activities = await prisma.activity.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, active: true },
  });
  const normalized = normalizeTrackingFilters(
    rawFilters,
    today,
    new Set(activities.map(({ id }) => id)),
  );
  const { filters } = normalized;
  const where: Prisma.ActivityOccurrenceWhereInput = {
    scheduledDate: {
      gte: parseCalendarDate(filters.from),
      lte: parseCalendarDate(filters.to),
    },
    ...(filters.activities.length === 0
      ? {}
      : { activityId: { in: filters.activities } }),
    ...(filters.statuses.length === 0
      ? {}
      : { status: { in: filters.statuses } }),
  };

  const analyticRecords = await prisma.activityOccurrence.findMany({
    where,
    orderBy: [{ scheduledDate: "asc" }, { position: "asc" }, { id: "asc" }],
    select: {
      scheduledDate: true,
      durationMinutes: true,
      status: true,
      activity: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          active: true,
        },
      },
    },
  });
  const analyticDtos: TrackingAnalyticOccurrence[] = analyticRecords.map(
    (occurrence) => ({
      scheduledDate: serializeCalendarDate(occurrence.scheduledDate),
      durationMinutes: occurrence.durationMinutes,
      status: occurrence.status,
      activity: occurrence.activity,
    }),
  );
  const analytics = calculateTrackingAnalytics(
    analyticDtos,
    filters.from,
    filters.to,
  );
  return {
    filters,
    period: normalized.period,
    summary: analytics.summary,
    minutesByActivity: analytics.minutesByActivity,
    monthWeekFrequency: analytics.monthWeekFrequency,
    monthlyFrequency: analytics.monthlyFrequency,
    activityOptions: activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      archived: !activity.active,
    })),
  };
}

export type TrackingDashboardDto = Awaited<
  ReturnType<typeof getTrackingDashboard>
>;
