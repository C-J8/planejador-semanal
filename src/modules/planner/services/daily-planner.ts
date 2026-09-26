import {
  parseCalendarDate,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/shared/lib/calendar-values";
import {
  summarizeOccurrenceStatuses,
  type OccurrenceStatusValue,
} from "@/modules/planner/lib/occurrence-status";
import { prisma } from "@/shared/lib/prisma";

export type DailyOccurrenceDto = {
  id: string;
  activityId: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  position: number;
  notes: string | null;
  status: OccurrenceStatusValue;
  completedAt: string | null;
  activity: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
    active: boolean;
  };
};

export type DailyEventDto = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  description: string | null;
  status: "SCHEDULED" | "CANCELLED";
};

export async function getDailyPlanner(date: string) {
  const calendarDate = parseCalendarDate(date);
  const [occurrences, events] = await Promise.all([
    prisma.activityOccurrence.findMany({
      where: { scheduledDate: calendarDate },
      include: { activity: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    prisma.calendarEvent.findMany({
      where: { eventDate: calendarDate },
      orderBy: [{ status: "asc" }, { startTime: "asc" }, { id: "asc" }],
    }),
  ]);
  const occurrenceDtos = occurrences.map((occurrence): DailyOccurrenceDto => ({
    id: occurrence.id,
    activityId: occurrence.activityId,
    date: serializeCalendarDate(occurrence.scheduledDate),
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
  }));
  return {
    date,
    occurrences: occurrenceDtos,
    events: events.map((event): DailyEventDto => ({
      id: event.id,
      title: event.title,
      date: serializeCalendarDate(event.eventDate),
      startTime: event.startTime ? serializeLocalTime(event.startTime) : null,
      durationMinutes: event.durationMinutes,
      description: event.description,
      status: event.status,
    })),
    summary: summarizeOccurrenceStatuses(
      occurrenceDtos.map((occurrence) => occurrence.status),
    ),
  };
}
