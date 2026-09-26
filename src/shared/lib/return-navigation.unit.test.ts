import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/shared/lib/return-navigation";

describe("return navigation", () => {
  it("preserva caminhos internos com consulta", () => {
    expect(safeReturnTo("/dia?date=2026-08-04", "/semana")).toBe(
      "/dia?date=2026-08-04",
    );
  });
  it.each(["https://example.com", "//example.com", "dia", undefined])(
    "rejeita retorno externo ou inválido",
    (value) => {
      expect(safeReturnTo(value, "/semana")).toBe("/semana");
    },
  );
});
