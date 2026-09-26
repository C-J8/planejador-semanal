import { describe, expect, it } from "vitest";
import { occurrenceFormToInput } from "@/modules/planner/lib/planner-form";

function occurrenceForm(durationMinutes: string) {
  const form = new FormData();
  form.set("scheduledDate", "2026-08-03");
  form.set("startTime", "");
  form.set("durationMinutes", durationMinutes);
  form.set("notes", "observação");
  return occurrenceFormToInput(form);
}

describe("formulário de ocorrência com duração opcional", () => {
  it("converte campo vazio em null sem alterar os demais campos", () => {
    const result = occurrenceForm("");
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({
        scheduledDate: "2026-08-03",
        startTime: null,
        durationMinutes: null,
        notes: "observação",
      });
  });

  it.each(["0", "-1", "1.5", "texto"])(
    "rejeita duração inválida %s",
    (value) => {
      expect(occurrenceForm(value).success).toBe(false);
    },
  );
});
