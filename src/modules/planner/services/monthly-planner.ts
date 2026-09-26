import {
  formatCalendarMonth,
  getMonthlyGrid,
  parseCalendarDate,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/shared/lib/calendar-values";
import type { OccurrenceStatusValue } from "@/modules/planner/lib/occurrence-status";
import { prisma } from "@/shared/lib/prisma";

export type MonthlyOccurrenceDto = {
  id: string;
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

export type MonthlyEventDto = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  description: string | null;
  status: "SCHEDULED" | "CANCELLED";
};

export async function getMonthlyPlanner(month: string, today: string) {
  const grid = getMonthlyGrid(month);
  const range = {
    gte: parseCalendarDate(grid.gridStart),
    lte: parseCalendarDate(grid.gridEnd),
  };
  const [occurrences, events] = await Promise.all([
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
  ]);

  const occurrenceDtos = occurrences.map(
    (occurrence): MonthlyOccurrenceDto => ({
      id: occurrence.id,
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
    }),
  );
  const eventDtos = events.map((event): MonthlyEventDto => ({
    id: event.id,
    title: event.title,
    date: serializeCalendarDate(event.eventDate),
    startTime: event.startTime ? serializeLocalTime(event.startTime) : null,
    durationMinutes: event.durationMinutes,
    description: event.description,
    status: event.status,
  }));

  return {
    month,
    monthLabel: formatCalendarMonth(month),
    firstDay: grid.firstDay,
    lastDay: grid.lastDay,
    gridStart: grid.gridStart,
    gridEnd: grid.gridEnd,
    isCurrentMonth: today.startsWith(month),
    isEmpty:
      occurrenceDtos.every((item) => !item.date.startsWith(month)) &&
      eventDtos.every((item) => !item.date.startsWith(month)),
    weeks: grid.weeks.map((week) => ({
      weekStart: week.weekStart,
      days: week.days.map((date) => ({
        date,
        belongsToSelectedMonth: date.startsWith(month),
        isToday: date === today,
        occurrences: occurrenceDtos.filter((item) => item.date === date),
        events: eventDtos.filter((item) => item.date === date),
      })),
    })),
  };
}
