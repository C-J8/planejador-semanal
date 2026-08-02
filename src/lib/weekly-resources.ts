import { z } from "zod";
import {
  addCalendarDays,
  calendarDateSchema,
  normalizeWeekStart,
  parseCalendarDate,
} from "@/lib/calendar-values";
import { durationSchema, idSchema } from "@/lib/domain-validation";

export const MAX_RECURRENCE_DAYS = 366;
export const MAX_RECURRENCE_CANDIDATES = 500;
export const MAX_INTERVAL_WEEKS = 52;

export const templateDetailsSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(80),
  description: z.string().trim().max(240).nullable().optional(),
});

export const recurrenceInputSchema = z
  .object({
    activityId: idSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    intervalWeeks: z.number().int().min(1).max(MAX_INTERVAL_WEEKS),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    durationMinutes: durationSchema.nullable(),
  })
  .refine((value) => new Set(value.weekdays).size === value.weekdays.length, {
    path: ["weekdays"],
    message: "Os dias da semana não podem se repetir",
  });

export type BatchCandidate = {
  itemKey: string;
  activityId: string;
  activityName: string;
  archived: boolean;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  sourcePosition: number;
};

export type ExistingSignature = Pick<
  BatchCandidate,
  "activityId" | "scheduledDate" | "startTime" | "durationMinutes"
>;

export type BatchPreviewItem = BatchCandidate & {
  result: "CREATE" | "DUPLICATE" | "PAST_DATE" | "ARCHIVED";
};

export function occurrenceSignature(item: ExistingSignature): string {
  return JSON.stringify([
    item.activityId,
    item.scheduledDate,
    item.startTime,
    item.durationMinutes,
  ]);
}

export function planBatchMerge(
  candidates: BatchCandidate[],
  existing: ExistingSignature[],
  today: string,
): BatchPreviewItem[] {
  const available = new Map<string, number>();
  for (const item of existing) {
    const key = occurrenceSignature(item);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const desired = new Map<string, number>();
  return candidates.map((item) => {
    if (item.archived) return { ...item, result: "ARCHIVED" };
    if (item.scheduledDate < today) return { ...item, result: "PAST_DATE" };
    const key = occurrenceSignature(item);
    const count = (desired.get(key) ?? 0) + 1;
    desired.set(key, count);
    return {
      ...item,
      result: count <= (available.get(key) ?? 0) ? "DUPLICATE" : "CREATE",
    };
  });
}

export function mapWeekday(sourceDate: string, targetWeek: string): string {
  const sourceWeek = normalizeWeekStart(sourceDate, sourceDate);
  const offset = Math.round(
    (parseCalendarDate(sourceDate).getTime() -
      parseCalendarDate(sourceWeek).getTime()) /
      86_400_000,
  );
  return addCalendarDays(normalizeWeekStart(targetWeek, targetWeek), offset);
}

export function calendarDayDifference(from: string, to: string): number {
  return Math.round(
    (parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime()) /
      86_400_000,
  );
}

export function calculateRecurrenceDates(input: {
  startDate: string;
  endDate: string;
  weekdays: number[];
  intervalWeeks: number;
}): string[] {
  const weekdays = new Set(input.weekdays);
  const anchor = normalizeWeekStart(input.startDate, input.startDate);
  const result: string[] = [];
  for (
    let date = input.startDate;
    date <= input.endDate;
    date = addCalendarDays(date, 1)
  ) {
    const dayOffset = calendarDayDifference(
      normalizeWeekStart(date, date),
      date,
    );
    const weekOffset =
      calendarDayDifference(anchor, normalizeWeekStart(date, date)) / 7;
    if (weekdays.has(dayOffset) && weekOffset % input.intervalWeeks === 0)
      result.push(date);
  }
  return result;
}

export function validateRecurrencePeriod(
  input: {
    startDate: string;
    endDate: string;
  },
  today: string,
) {
  if (input.startDate < today)
    throw new Error("A data inicial não pode estar no passado");
  if (input.endDate < input.startDate)
    throw new Error("A data final deve ser igual ou posterior à inicial");
  if (
    calendarDayDifference(input.startDate, input.endDate) + 1 >
    MAX_RECURRENCE_DAYS
  )
    throw new Error("A repetição pode abranger no máximo 366 dias");
}
