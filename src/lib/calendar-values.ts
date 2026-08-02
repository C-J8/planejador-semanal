import { z } from "zod";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export const calendarDateSchema = z
  .string()
  .regex(DATE_PATTERN, "A data deve estar no formato YYYY-MM-DD")
  .refine((value) => {
    const match = DATE_PATTERN.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "A data informada não existe");

export const localTimeSchema = z
  .string()
  .regex(TIME_PATTERN, "O horário deve estar no formato HH:mm")
  .refine((value) => {
    const match = TIME_PATTERN.exec(value);
    return Boolean(
      match &&
      Number(match[1]) >= 0 &&
      Number(match[1]) <= 23 &&
      Number(match[2]) <= 59,
    );
  }, "O horário informado não existe");

export const calendarMonthSchema = z
  .string()
  .regex(MONTH_PATTERN, "O mês deve estar no formato YYYY-MM")
  .refine((value) => {
    const match = MONTH_PATTERN.exec(value);
    return Boolean(
      match &&
      Number(match[1]) >= 1 &&
      Number(match[2]) >= 1 &&
      Number(match[2]) <= 12,
    );
  }, "O mês informado não existe");

export function parseCalendarDate(value: string): Date {
  const parsed = calendarDateSchema.parse(value);
  return new Date(`${parsed}T00:00:00.000Z`);
}

export function serializeCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseLocalTime(value: string): Date {
  const parsed = localTimeSchema.parse(value);
  return new Date(`1970-01-01T${parsed}:00.000Z`);
}

export function serializeLocalTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}

export function currentCalendarDate(
  now = new Date(),
  timeZone = "America/Sao_Paulo",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function currentCalendarMonth(
  now = new Date(),
  timeZone = "America/Sao_Paulo",
): string {
  return currentCalendarDate(now, timeZone).slice(0, 7);
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return serializeCalendarDate(date);
}

export function normalizeCalendarDate(
  value?: string,
  today = currentCalendarDate(),
): string {
  return calendarDateSchema.safeParse(value).success ? value! : today;
}

export function normalizeCalendarMonth(
  value?: string,
  currentMonth = currentCalendarMonth(),
): string {
  return calendarMonthSchema.safeParse(value).success ? value! : currentMonth;
}

export function addCalendarMonths(value: string, amount: number): string {
  const month = calendarMonthSchema.parse(value);
  const [year, monthNumber] = month.split("-").map(Number);
  const absoluteMonth = year * 12 + monthNumber - 1 + amount;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = (((absoluteMonth % 12) + 12) % 12) + 1;
  if (nextYear < 1 || nextYear > 9999)
    throw new RangeError("O mês calculado está fora do intervalo suportado");
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function getCalendarMonthBounds(value: string) {
  const month = calendarMonthSchema.parse(value);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    firstDay: `${month}-01`,
    lastDay: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function getMonthlyGrid(value: string) {
  const { firstDay, lastDay } = getCalendarMonthBounds(value);
  const gridStart = normalizeWeekStart(firstDay, firstDay);
  const gridEnd = addCalendarDays(normalizeWeekStart(lastDay, lastDay), 6);
  const days: string[] = [];
  for (let date = gridStart; date <= gridEnd; date = addCalendarDays(date, 1))
    days.push(date);
  return {
    firstDay,
    lastDay,
    gridStart,
    gridEnd,
    days,
    weeks: Array.from({ length: days.length / 7 }, (_, index) => ({
      weekStart: days[index * 7],
      days: days.slice(index * 7, index * 7 + 7),
    })),
  };
}

export function normalizeWeekStart(
  value?: string,
  today = currentCalendarDate(),
): string {
  const candidate = calendarDateSchema.safeParse(value).success
    ? value!
    : today;
  const date = parseCalendarDate(candidate);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addCalendarDays(candidate, -daysSinceMonday);
}

export function getWeekDates(weekStart: string): string[] {
  const monday = normalizeWeekStart(weekStart, weekStart);
  return Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(monday, index),
  );
}

export function isDateInWeek(value: string, weekStart: string): boolean {
  return value >= weekStart && value <= addCalendarDays(weekStart, 6);
}

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const fullDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "short",
});

export function formatWeekRange(weekStart: string): string {
  const end = addCalendarDays(weekStart, 6);
  const year = end.slice(0, 4);
  return `${shortDateFormatter.format(parseCalendarDate(weekStart))} – ${shortDateFormatter.format(parseCalendarDate(end))} de ${year}`;
}

export function formatCalendarDay(value: string): string {
  return fullDateFormatter.format(parseCalendarDate(value));
}

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatCalendarDateLong(value: string): string {
  return longDateFormatter.format(parseCalendarDate(value));
}

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function formatCalendarMonth(value: string): string {
  const { firstDay } = getCalendarMonthBounds(value);
  return monthFormatter.format(parseCalendarDate(firstDay));
}

export function formatSaoPauloInstant(value: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}
