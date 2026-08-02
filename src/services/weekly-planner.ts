import {
  addCalendarDays,
  getWeekDates,
  parseCalendarDate,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import { prisma } from "@/lib/prisma";

export type PlannerActivityDto = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  defaultDurationMinutes: number | null;
  defaultStartTime: string | null;
};

export type PlannerOccurrenceDto = {
  id: string;
  activityId: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  position: number;
  notes: string | null;
  status: "PLANNED" | "COMPLETED" | "SKIPPED";
  activity: Pick<PlannerActivityDto, "id" | "name" | "color" | "icon">;
};

export type PlannerEventDto = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  description: string | null;
  status: "SCHEDULED" | "CANCELLED";
};

export async function getWeeklyPlanner(weekStart: string) {
  const weekEnd = addCalendarDays(weekStart, 6);
  const range = {
    gte: parseCalendarDate(weekStart),
    lte: parseCalendarDate(weekEnd),
  };

  const [occurrences, events, activities] = await Promise.all([
    prisma.activityOccurrence.findMany({
      where: { scheduledDate: range },
      include: { activity: true },
      orderBy: [{ scheduledDate: "asc" }, { position: "asc" }, { id: "asc" }],
    }),
    prisma.calendarEvent.findMany({
      where: { eventDate: range },
      orderBy: [
        { eventDate: "asc" },
        { status: "asc" },
        { startTime: "asc" },
        { id: "asc" },
      ],
    }),
    prisma.activity.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    weekStart,
    days: getWeekDates(weekStart),
    activities: activities.map((activity): PlannerActivityDto => ({
      id: activity.id,
      name: activity.name,
      color: activity.color,
      icon: activity.icon,
      defaultDurationMinutes: activity.defaultDurationMinutes,
      defaultStartTime: activity.defaultStartTime
        ? serializeLocalTime(activity.defaultStartTime)
        : null,
    })),
    occurrences: occurrences.map((occurrence): PlannerOccurrenceDto => ({
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
      activity: {
        id: occurrence.activity.id,
        name: occurrence.activity.name,
        color: occurrence.activity.color,
        icon: occurrence.activity.icon,
      },
    })),
    events: events.map((event): PlannerEventDto => ({
      id: event.id,
      title: event.title,
      date: serializeCalendarDate(event.eventDate),
      startTime: event.startTime ? serializeLocalTime(event.startTime) : null,
      durationMinutes: event.durationMinutes,
      description: event.description,
      status: event.status,
    })),
  };
}
