import { describe, expect, it } from "vitest";
import {
  calendarDateSchema,
  formatCalendarDateNumeric,
  localTimeSchema,
  parseCalendarDate,
  parseLocalTime,
  resolveCalendarDate,
  resolveCalendarMonth,
  resolveWeekStart,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import {
  activityCreateSchema,
  colorSchema,
  durationSchema,
  eventTitleSchema,
  nameSchema,
  positionSchema,
} from "@/lib/domain-validation";

describe("datas de calendário", () => {
  it.each(["2026-08-03", "2024-02-29"])("aceita a data real %s", (value) => {
    expect(calendarDateSchema.parse(value)).toBe(value);
  });

  it.each(["2026-02-29", "2024-02-30", "2026-13-01", "03/08/2026"])(
    "rejeita a data inválida %s",
    (value) => expect(() => calendarDateSchema.parse(value)).toThrow(),
  );

  it("mantém o dia no round-trip", () => {
    const value = "2026-08-03";
    expect(serializeCalendarDate(parseCalendarDate(value))).toBe(value);
  });

  it("formata a data numericamente em português", () => {
    expect(formatCalendarDateNumeric("2026-08-04")).toBe("04/08/2026");
  });

  it("usa padrão somente quando o parâmetro está ausente", () => {
    expect(resolveCalendarDate(undefined, "2026-08-02")).toBe("2026-08-02");
    expect(() => resolveCalendarDate("2026-02-30", "2026-08-02")).toThrow();
    expect(() => resolveCalendarDate("02/08/2026", "2026-08-02")).toThrow();
  });

  it.each([
    ["2024-02-29", "2024-02-29"],
    ["2026-12-31", "2026-12-31"],
    ["2027-01-01", "2027-01-01"],
  ])("resolve limites válidos sem deslocamento: %s", (value, expected) => {
    expect(resolveCalendarDate(value, "2026-08-02")).toBe(expected);
  });

  it("rejeita mês e semana explicitamente inválidos", () => {
    expect(resolveCalendarMonth(undefined, "2026-08")).toBe("2026-08");
    expect(() => resolveCalendarMonth("2026-13", "2026-08")).toThrow();
    expect(resolveWeekStart("2026-08-02")).toBe("2026-07-27");
    expect(() => resolveWeekStart("inválida")).toThrow();
  });
});

describe("horários locais", () => {
  it.each(["00:00", "09:05", "23:59"])("aceita o horário %s", (value) => {
    expect(localTimeSchema.parse(value)).toBe(value);
  });

  it.each(["24:00", "12:60", "9:00", "09:5"])(
    "rejeita o horário %s",
    (value) => {
      expect(() => localTimeSchema.parse(value)).toThrow();
    },
  );

  it("mantém o horário no round-trip", () => {
    const value = "23:00";
    expect(serializeLocalTime(parseLocalTime(value))).toBe(value);
  });
});

describe("validações do domínio", () => {
  it.each(["#EF4444", "#3b82f6"])("aceita e normaliza a cor %s", (value) => {
    expect(colorSchema.parse(value)).toMatch(/^#[0-9A-F]{6}$/);
  });

  it.each(["EF4444", "#FFFF", "#GG0000"])("rejeita a cor %s", (value) => {
    expect(() => colorSchema.parse(value)).toThrow();
  });

  it.each([0, -1, 1.5])("rejeita a duração %s", (value) => {
    expect(() => durationSchema.parse(value)).toThrow();
  });

  it.each([-1, 1.5])("rejeita a posição %s", (value) => {
    expect(() => positionSchema.parse(value)).toThrow();
  });

  it.each(["", "   "])("rejeita nome vazio", (value) => {
    expect(() => nameSchema.parse(value)).toThrow();
  });

  it.each(["", "   "])("rejeita título vazio", (value) => {
    expect(() => eventTitleSchema.parse(value)).toThrow();
  });

  it("aplica trim aos textos", () => {
    const result = activityCreateSchema.parse({
      name: "  Academia  ",
      color: "#ef4444",
      defaultDurationMinutes: 60,
    });
    expect(result.name).toBe("Academia");
    expect(result.color).toBe("#EF4444");
  });
});
