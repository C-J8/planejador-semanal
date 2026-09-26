import { describe, expect, it } from "vitest";
import {
  formatCalendarDateLong,
  formatSaoPauloInstant,
  normalizeCalendarDate,
} from "@/shared/lib/calendar-values";
import {
  InvalidOccurrenceTransitionError,
  occurrenceStatusLabels,
  resolveOccurrenceTransition,
  summarizeOccurrenceStatuses,
} from "@/modules/planner/lib/occurrence-status";

describe("data da tela Dia", () => {
  it("mantém uma data válida", () => {
    expect(normalizeCalendarDate("2026-08-03", "2026-07-31")).toBe(
      "2026-08-03",
    );
  });
  it.each([undefined, "2026-02-30", "03/08/2026"])(
    "usa hoje para o valor inválido %s",
    (value) =>
      expect(normalizeCalendarDate(value, "2026-07-31")).toBe("2026-07-31"),
  );
  it("formata a data completa em português", () => {
    expect(formatCalendarDateLong("2026-08-03")).toBe(
      "segunda-feira, 3 de agosto de 2026",
    );
  });
  it("formata o instante de conclusão em São Paulo", () => {
    expect(formatSaoPauloInstant("2026-08-03T15:30:00.000Z")).toContain(
      "12:30",
    );
  });
});

describe("transições de execução", () => {
  const now = new Date("2026-08-03T15:30:00.000Z");
  it("conclui uma planejada com o relógio informado", () => {
    expect(
      resolveOccurrenceTransition(
        { status: "PLANNED", completedAt: null },
        "complete",
        now,
      ),
    ).toEqual({
      kind: "update",
      expectedStatus: "PLANNED",
      status: "COMPLETED",
      completedAt: now,
    });
  });
  it("pula uma planejada sem preencher conclusão", () => {
    expect(
      resolveOccurrenceTransition(
        { status: "PLANNED", completedAt: null },
        "skip",
        now,
      ),
    ).toMatchObject({ status: "SKIPPED", completedAt: null });
  });
  it.each(["COMPLETED", "SKIPPED"] as const)(
    "reabre %s e limpa a conclusão",
    (status) =>
      expect(
        resolveOccurrenceTransition({ status, completedAt: now }, "reopen"),
      ).toMatchObject({ status: "PLANNED", completedAt: null }),
  );
  it.each([
    ["COMPLETED", "complete"],
    ["SKIPPED", "skip"],
    ["PLANNED", "reopen"],
  ] as const)("é idempotente em %s + %s", (status, operation) => {
    expect(
      resolveOccurrenceTransition({ status, completedAt: now }, operation),
    ).toEqual({ kind: "idempotent" });
  });
  it.each([
    ["COMPLETED", "skip"],
    ["SKIPPED", "complete"],
  ] as const)("rejeita a troca direta %s + %s", (status, operation) => {
    expect(() =>
      resolveOccurrenceTransition({ status, completedAt: now }, operation),
    ).toThrow(InvalidOccurrenceTransitionError);
  });
});

describe("apresentação diária", () => {
  it("resume os status de ocorrências", () => {
    expect(
      summarizeOccurrenceStatuses([
        "PLANNED",
        "COMPLETED",
        "COMPLETED",
        "SKIPPED",
      ]),
    ).toEqual({ planned: 1, completed: 2, skipped: 1, total: 4 });
  });
  it("expõe todos os rótulos em português", () => {
    expect(occurrenceStatusLabels).toEqual({
      PLANNED: "Planejada",
      COMPLETED: "Concluída",
      SKIPPED: "Pulada",
    });
  });
});
