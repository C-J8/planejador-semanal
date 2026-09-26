import { describe, expect, it } from "vitest";
import {
  calculateRecurrenceDates,
  mapWeekday,
  occurrenceSignature,
  planBatchMerge,
  recurrenceInputSchema,
  validateRecurrencePeriod,
  type BatchCandidate,
} from "@/modules/planner/lib/weekly-resources";

const candidate = (
  key: string,
  overrides: Partial<BatchCandidate> = {},
): BatchCandidate => ({
  itemKey: key,
  activityId: "11111111-1111-4111-8111-111111111111",
  activityName: "Leitura",
  archived: false,
  scheduledDate: "2026-08-07",
  startTime: "18:30",
  durationMinutes: 60,
  sourcePosition: 0,
  ...overrides,
});

describe("recursos semanais", () => {
  it("mapeia o mesmo dia relativo entre semanas e anos", () => {
    expect(mapWeekday("2026-12-30", "2027-01-04")).toBe("2027-01-06");
  });

  it("usa null explicitamente na assinatura de equivalência", () => {
    expect(
      occurrenceSignature(candidate("a", { durationMinutes: null })),
    ).not.toBe(occurrenceSignature(candidate("b", { durationMinutes: 60 })));
  });

  it("preserva multiplicidade comparando quantidades", () => {
    const items = planBatchMerge(
      [candidate("a"), candidate("b")],
      [candidate("existing")],
      "2026-08-01",
    );
    expect(items.map((item) => item.result)).toEqual(["DUPLICATE", "CREATE"]);
  });

  it("fica idempotente quando o destino já possui toda a multiplicidade", () => {
    const items = planBatchMerge(
      [candidate("a"), candidate("b")],
      [candidate("x"), candidate("y")],
      "2026-08-01",
    );
    expect(items.every((item) => item.result === "DUPLICATE")).toBe(true);
  });

  it("classifica passado e atividade arquivada antes de duplicidade", () => {
    const items = planBatchMerge(
      [
        candidate("past", { scheduledDate: "2026-07-31" }),
        candidate("archived", { archived: true }),
      ],
      [],
      "2026-08-01",
    );
    expect(items.map((item) => item.result)).toEqual(["PAST_DATE", "ARCHIVED"]);
  });

  it("calcula repetição ancorada na segunda com semana parcial", () => {
    expect(
      calculateRecurrenceDates({
        startDate: "2026-08-05",
        endDate: "2026-08-17",
        weekdays: [0, 2],
        intervalWeeks: 1,
      }),
    ).toEqual(["2026-08-05", "2026-08-10", "2026-08-12", "2026-08-17"]);
  });

  it("respeita intervalo quinzenal, mudança de ano e fevereiro bissexto", () => {
    expect(
      calculateRecurrenceDates({
        startDate: "2027-12-27",
        endDate: "2028-03-01",
        weekdays: [0, 2],
        intervalWeeks: 2,
      }),
    ).toContain("2028-02-21");
    expect(
      calculateRecurrenceDates({
        startDate: "2027-12-27",
        endDate: "2028-03-01",
        weekdays: [0, 2],
        intervalWeeks: 2,
      }),
    ).not.toContain("2028-02-28");
  });

  it("inclui a data final quando ela corresponde ao padrão", () => {
    expect(
      calculateRecurrenceDates({
        startDate: "2026-08-03",
        endDate: "2026-08-17",
        weekdays: [0],
        intervalWeeks: 1,
      }),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("rejeita dias duplicados e intervalos fora do limite", () => {
    const base = {
      activityId: "11111111-1111-4111-8111-111111111111",
      startDate: "2026-08-03",
      endDate: "2026-08-10",
      startTime: null,
      durationMinutes: null,
    };
    expect(
      recurrenceInputSchema.safeParse({
        ...base,
        weekdays: [0, 0],
        intervalWeeks: 1,
      }).success,
    ).toBe(false);
    expect(
      recurrenceInputSchema.safeParse({
        ...base,
        weekdays: [0],
        intervalWeeks: 53,
      }).success,
    ).toBe(false);
  });

  it("rejeita passado, fim anterior e período acima de 366 dias", () => {
    expect(() =>
      validateRecurrencePeriod(
        { startDate: "2026-07-31", endDate: "2026-08-01" },
        "2026-08-01",
      ),
    ).toThrow(/passado/);
    expect(() =>
      validateRecurrencePeriod(
        { startDate: "2026-08-03", endDate: "2026-08-02" },
        "2026-08-01",
      ),
    ).toThrow(/posterior/);
    expect(() =>
      validateRecurrencePeriod(
        { startDate: "2026-08-03", endDate: "2027-08-04" },
        "2026-08-01",
      ),
    ).toThrow(/366/);
  });
});
