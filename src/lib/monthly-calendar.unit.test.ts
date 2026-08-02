import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  calendarMonthSchema,
  currentCalendarMonth,
  formatCalendarMonth,
  getCalendarMonthBounds,
  getMonthlyGrid,
  normalizeCalendarMonth,
  parseCalendarDate,
  serializeCalendarDate,
} from "@/lib/calendar-values";

describe("validação e apresentação do mês", () => {
  it.each(["2026-01", "2026-12"])("aceita %s", (month) => {
    expect(calendarMonthSchema.parse(month)).toBe(month);
  });

  it.each([undefined, "2026-1", "2026-00", "2026-13", "2026-01-01", "julho"])(
    "usa o mês atual para %s",
    (month) => expect(normalizeCalendarMonth(month, "2026-07")).toBe("2026-07"),
  );

  it("formata em português", () => {
    expect(formatCalendarMonth("2026-07")).toBe("julho de 2026");
  });
});

describe("navegação mensal", () => {
  it.each([
    ["2026-01", -1, "2025-12"],
    ["2026-12", 1, "2027-01"],
    ["2026-07", -1, "2026-06"],
    ["2026-07", 1, "2026-08"],
  ] as const)("navega de %s por %s", (month, amount, expected) => {
    expect(addCalendarMonths(month, amount)).toBe(expected);
  });

  it("preserva o ano com quatro dígitos", () => {
    expect(addCalendarMonths("0001-01", 1)).toBe("0001-02");
  });
});

describe("mês atual e datas locais", () => {
  it("calcula o mês em America/Sao_Paulo", () => {
    expect(
      currentCalendarMonth(
        new Date("2026-08-01T01:30:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe("2026-07");
  });

  it("permite outro timezone explicitamente", () => {
    expect(
      currentCalendarMonth(new Date("2026-08-01T01:30:00.000Z"), "UTC"),
    ).toBe("2026-08");
  });

  it("mantém a data local no round-trip", () => {
    expect(serializeCalendarDate(parseCalendarDate("2026-07-31"))).toBe(
      "2026-07-31",
    );
  });
});

describe("grade mensal de segunda a domingo", () => {
  it("calcula julho de 2026 conforme o intervalo de aceite", () => {
    const grid = getMonthlyGrid("2026-07");
    expect(grid.gridStart).toBe("2026-06-29");
    expect(grid.gridEnd).toBe("2026-08-02");
    expect(grid.days).toHaveLength(35);
  });

  it("mantém mês iniciado na segunda sem dias anteriores", () => {
    expect(getMonthlyGrid("2026-06").gridStart).toBe("2026-06-01");
  });

  it("inclui seis semanas quando necessário", () => {
    const grid = getMonthlyGrid("2026-08");
    expect(grid.days).toHaveLength(42);
    expect(grid.weeks).toHaveLength(6);
  });

  it.each([
    ["2026-02", "2026-02-28"],
    ["2028-02", "2028-02-29"],
    ["2026-12", "2026-12-31"],
  ] as const)("calcula o último dia de %s", (month, lastDay) => {
    expect(getCalendarMonthBounds(month).lastDay).toBe(lastDay);
  });

  it.each(["2026-02", "2026-07", "2026-08"])(
    "possui semanas completas e datas únicas em %s",
    (month) => {
      const grid = getMonthlyGrid(month);
      expect(grid.days.length % 7).toBe(0);
      expect(new Set(grid.days).size).toBe(grid.days.length);
      expect(parseCalendarDate(grid.gridStart).getUTCDay()).toBe(1);
      expect(parseCalendarDate(grid.gridEnd).getUTCDay()).toBe(0);
      expect(
        grid.weeks.every(
          (week) => parseCalendarDate(week.weekStart).getUTCDay() === 1,
        ),
      ).toBe(true);
    },
  );

  it("identifica dias anteriores e posteriores pelo prefixo do mês", () => {
    const grid = getMonthlyGrid("2026-07");
    expect(grid.days.filter((date) => !date.startsWith("2026-07"))).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});
