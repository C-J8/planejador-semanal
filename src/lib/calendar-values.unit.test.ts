import { describe, expect, it } from "vitest";
import {
  calendarDateSchema,
  localTimeSchema,
  parseCalendarDate,
  parseLocalTime,
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
