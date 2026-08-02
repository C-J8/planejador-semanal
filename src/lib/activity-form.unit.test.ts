import { describe, expect, it } from "vitest";
import {
  activityFormToInput,
  friendlyActivityError,
  validationFields,
} from "@/lib/activity-form";
import {
  normalizeActivityQuery,
  normalizeActivityStatus,
} from "@/lib/activity-query";

function validForm() {
  const formData = new FormData();
  formData.set("name", "  Estudo  ");
  formData.set("color", "#3b82f6");
  formData.set("icon", "");
  formData.set("defaultDurationMinutes", "45");
  formData.set("defaultStartTime", "");
  formData.set("description", "");
  return formData;
}

describe("formulário de atividades", () => {
  it("converte strings, normaliza e transforma opcionais vazios em null", () => {
    const result = activityFormToInput(validForm());
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual({
      name: "Estudo",
      color: "#3B82F6",
      icon: null,
      defaultDurationMinutes: 45,
      defaultStartTime: null,
      description: null,
    });
  });

  it.each(["zero", "1.5", "0", "-1"])("rejeita a duração %s", (duration) => {
    const formData = validForm();
    formData.set("defaultDurationMinutes", duration);
    expect(activityFormToInput(formData).success).toBe(false);
  });

  it("aceita duração padrão ausente e preserva null", () => {
    const formData = validForm();
    formData.set("defaultDurationMinutes", "");
    const result = activityFormToInput(formData);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultDurationMinutes).toBeNull();
  });

  it("mapeia erros de validação para o campo", () => {
    const formData = validForm();
    formData.set("name", "  ");
    const result = activityFormToInput(formData);
    if (result.success) throw new Error("O formulário deveria ser inválido");

    expect(validationFields(result.error)?.name?.[0]).toContain("obrigatório");
  });

  it("produz mensagem amigável para nome duplicado", () => {
    expect(friendlyActivityError({ code: "P2002" })).toBe(
      "Já existe uma atividade com esse nome.",
    );
    expect(friendlyActivityError({ code: "P2002" }, true)).toContain(
      "Arquivadas",
    );
  });
});

describe("consulta de atividades", () => {
  it.each(["active", "archived", "all"])("aceita o status %s", (status) => {
    expect(normalizeActivityStatus(status)).toBe(status);
  });

  it.each(["invalid", "", undefined, ["active"]])(
    "usa active para status inválido",
    (status) => expect(normalizeActivityStatus(status)).toBe("active"),
  );

  it("normaliza e limita a pesquisa", () => {
    expect(normalizeActivityQuery("  academia  ")).toBe("academia");
    expect(normalizeActivityQuery("a".repeat(120))).toHaveLength(100);
    expect(normalizeActivityQuery(["academia"])).toBe("");
  });
});
