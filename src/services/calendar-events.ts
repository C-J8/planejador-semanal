import { z } from "zod";
import { parseCalendarDate, parseLocalTime } from "@/lib/calendar-values";
import {
  eventCreateSchema,
  eventUpdateSchema,
  idSchema,
} from "@/lib/domain-validation";
import { prisma } from "@/lib/prisma";

export type CreateCalendarEventInput = z.input<typeof eventCreateSchema>;
export type UpdateCalendarEventInput = z.input<typeof eventUpdateSchema>;

export function getCalendarEvent(id: string) {
  return prisma.calendarEvent.findUnique({ where: { id: idSchema.parse(id) } });
}

export function createCalendarEvent(input: CreateCalendarEventInput) {
  const data = eventCreateSchema.parse(input);

  return prisma.calendarEvent.create({
    data: {
      ...data,
      eventDate: parseCalendarDate(data.eventDate),
      startTime: data.startTime ? parseLocalTime(data.startTime) : null,
    },
  });
}

export function updateCalendarEvent(
  id: string,
  input: UpdateCalendarEventInput,
) {
  const eventId = idSchema.parse(id);
  const data = eventUpdateSchema.parse(input);

  return prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...data,
      eventDate: data.eventDate ? parseCalendarDate(data.eventDate) : undefined,
      startTime:
        data.startTime === undefined
          ? undefined
          : data.startTime === null
            ? null
            : parseLocalTime(data.startTime),
    },
  });
}

export function rescheduleCalendarEvent(id: string, eventDate: string) {
  return updateCalendarEvent(id, { eventDate });
}

export function cancelCalendarEvent(id: string) {
  return prisma.calendarEvent.update({
    where: { id: idSchema.parse(id) },
    data: { status: "CANCELLED" },
  });
}

export function deleteCalendarEvent(id: string) {
  return prisma.calendarEvent.delete({ where: { id: idSchema.parse(id) } });
}
