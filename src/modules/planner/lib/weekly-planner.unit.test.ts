import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  currentCalendarDate,
  getWeekDates,
  isDateInWeek,
  normalizeWeekStart,
  serializeCalendarDate,
  parseCalendarDate,
} from "@/shared/lib/calendar-values";
import { occurrenceMoveSchema } from "@/shared/lib/domain-validation";
import {
  insertAtSafeIndex,
  normalizedPositions,
} from "@/modules/planner/lib/occurrence-order";
import {
  eventFormToInput,
  occurrenceFormToInput,
} from "@/modules/planner/lib/planner-form";

describe("semana de segunda a domingo", () => {
  it.each([
    ["2026-07-27", "2026-07-27"],
    ["2026-07-28", "2026-07-27"],
    ["2026-08-02", "2026-07-27"],
    ["2027-01-01", "2026-12-28"],
    ["2024-02-29", "2024-02-26"],
  ])("normaliza %s para %s", (value, expected) => {
    expect(normalizeWeekStart(value)).toBe(expected);
  });

  it("usa a semana atual para parâmetro inválido", () => {
    expect(normalizeWeekStart("inválida", "2026-07-31")).toBe("2026-07-27");
  });

  it("gera exatamente sete dias atravessando mês", () => {
    expect(getWeekDates("2026-07-27")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("soma dias e mantém o round-trip", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(serializeCalendarDate(parseCalendarDate("2026-08-03"))).toBe(
      "2026-08-03",
    );
    expect(isDateInWeek("2026-08-02", "2026-07-27")).toBe(true);
    expect(isDateInWeek("2026-08-03", "2026-07-27")).toBe(false);
  });

  it("calcula hoje em São Paulo perto da meia-noite UTC", () => {
    const instant = new Date("2026-08-03T02:30:00.000Z");
    expect(currentCalendarDate(instant, "UTC")).toBe("2026-08-03");
    expect(currentCalendarDate(instant, "America/Sao_Paulo")).toBe(
      "2026-08-02",
    );
  });
});

describe("ordenação de ocorrências", () => {
  it("insere no início, meio e fim", () => {
    expect(insertAtSafeIndex(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(insertAtSafeIndex(["a", "b"], "c", 1)).toEqual(["a", "c", "b"]);
    expect(insertAtSafeIndex(["a", "b"], "c", 99)).toEqual(["a", "b", "c"]);
  });

  it("reordena sem duplicar e compacta posições", () => {
    const reordered = insertAtSafeIndex(["a", "b", "c"], "a", 2);
    expect(reordered).toEqual(["b", "c", "a"]);
    expect(normalizedPositions(reordered)).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 1 },
      { id: "a", position: 2 },
    ]);
  });

  it("limita índice desatualizado e rejeita índice negativo na fronteira", () => {
    expect(insertAtSafeIndex(["a"], "b", 20)).toEqual(["a", "b"]);
    expect(() =>
      occurrenceMoveSchema.parse({
        occurrenceId: "00000000-0000-4000-8000-000000000000",
        targetDate: "2026-08-03",
        targetIndex: -1,
      }),
    ).toThrow();
  });

  it("não inclui eventos na lista ordenável", () => {
    const occurrences = ["occurrence-a", "occurrence-b"];
    const events = ["event-a"];
    expect(insertAtSafeIndex(occurrences, "occurrence-b", 0)).toEqual([
      "occurrence-b",
      "occurrence-a",
    ]);
    expect(events).toEqual(["event-a"]);
  });
});

describe("formulários do planejador", () => {
  it("converte opcionais vazios da ocorrência para null e normaliza notas", () => {
    const data = new FormData();
    data.set("scheduledDate", "2026-08-03");
    data.set("startTime", "");
    data.set("durationMinutes", "75");
    data.set("notes", "  Estudo focado  ");
    const result = occurrenceFormToInput(data);
    expect(result.success && result.data).toMatchObject({
      startTime: null,
      durationMinutes: 75,
      notes: "Estudo focado",
    });
  });

  it.each([
    ["scheduledDate", "inválida"],
    ["startTime", "25:00"],
    ["durationMinutes", "0"],
  ])("rejeita %s inválido", (field, value) => {
    const data = new FormData();
    data.set("scheduledDate", "2026-08-03");
    data.set("startTime", "18:30");
    data.set("durationMinutes", "30");
    data.set(field, value);
    expect(occurrenceFormToInput(data).success).toBe(false);
  });

  it("normaliza título e opcionais do evento", () => {
    const data = new FormData();
    data.set("title", "  Consulta  ");
    data.set("eventDate", "2026-08-05");
    data.set("startTime", "");
    data.set("durationMinutes", "");
    data.set("description", "");
    const result = eventFormToInput(data);
    expect(result.success && result.data).toMatchObject({
      title: "Consulta",
      startTime: null,
      durationMinutes: null,
      description: null,
    });
  });

  it("rejeita UUID inválido no movimento", () => {
    expect(
      occurrenceMoveSchema.safeParse({
        occurrenceId: "inválido",
        targetDate: "2026-08-03",
        targetIndex: 0,
      }).success,
    ).toBe(false);
  });
});
