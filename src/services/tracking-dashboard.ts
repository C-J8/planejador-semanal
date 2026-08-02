import type { Prisma } from "@/generated/prisma/client";
import {
  parseCalendarDate,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import {
  calculateTrackingAnalytics,
  normalizeTrackingFilters,
  validateTrackingPeriod,
  TRACKING_PAGE_SIZE,
  type RawTrackingFilters,
  type TrackingAnalyticOccurrence,
} from "@/lib/tracking-values";
import { prisma } from "@/lib/prisma";

export type TrackingHistoryItemDto = {
  id: string;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  position: number;
  notes: string | null;
  status: "PLANNED" | "COMPLETED" | "SKIPPED";
  completedAt: string | null;
  activity: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
    active: boolean;
  };
};

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
    ...(filters.activity === "all" ? {} : { activityId: filters.activity }),
    ...(filters.status === "ALL" ? {} : { status: filters.status }),
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
  const totalPages = Math.max(
    1,
    Math.ceil(analytics.summary.totalCount / TRACKING_PAGE_SIZE),
  );
  const page = Math.min(filters.page, totalPages);
  filters.page = page;

  const historyRecords = await prisma.activityOccurrence.findMany({
    where,
    skip: (page - 1) * TRACKING_PAGE_SIZE,
    take: TRACKING_PAGE_SIZE,
    orderBy: [
      { scheduledDate: "desc" },
      { startTime: { sort: "asc", nulls: "last" } },
      { position: "asc" },
      { id: "asc" },
    ],
    include: { activity: true },
  });

  return {
    filters,
    period: normalized.period,
    summary: analytics.summary,
    minutesByActivity: analytics.minutesByActivity,
    weeklyFrequency: analytics.weeklyFrequency,
    monthlyFrequency: analytics.monthlyFrequency,
    activityOptions: activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      archived: !activity.active,
    })),
    history: {
      items: historyRecords.map((occurrence): TrackingHistoryItemDto => ({
        id: occurrence.id,
        scheduledDate: serializeCalendarDate(occurrence.scheduledDate),
        startTime: occurrence.startTime
          ? serializeLocalTime(occurrence.startTime)
          : null,
        durationMinutes: occurrence.durationMinutes,
        position: occurrence.position,
        notes: occurrence.notes,
        status: occurrence.status,
        completedAt: occurrence.completedAt?.toISOString() ?? null,
        activity: {
          id: occurrence.activity.id,
          name: occurrence.activity.name,
          color: occurrence.activity.color,
          icon: occurrence.activity.icon,
          active: occurrence.activity.active,
        },
      })),
      total: analytics.summary.totalCount,
      page,
      pageSize: TRACKING_PAGE_SIZE,
      totalPages,
      fromItem:
        analytics.summary.totalCount === 0
          ? 0
          : (page - 1) * TRACKING_PAGE_SIZE + 1,
      toItem: Math.min(page * TRACKING_PAGE_SIZE, analytics.summary.totalCount),
    },
  };
}

export type TrackingDashboardDto = Awaited<
  ReturnType<typeof getTrackingDashboard>
>;
