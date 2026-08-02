import { z } from "zod";
import { activityCreateSchema } from "@/lib/domain-validation";

export type ActivityFormValues = {
  name: string;
  color: string;
  icon: string | null;
  defaultDurationMinutes: number | null;
  defaultStartTime: string | null;
  description: string | null;
};

export type ActivityFormState = {
  message?: string;
  fields?: Partial<Record<keyof ActivityFormValues, string[]>>;
  values?: Partial<Record<keyof ActivityFormValues, string>>;
};

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalValue(value: string): string | null {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function activityFormToInput(formData: FormData) {
  const duration = optionalValue(
    stringValue(formData, "defaultDurationMinutes"),
  );
  const raw = {
    name: stringValue(formData, "name"),
    color: stringValue(formData, "color"),
    icon: optionalValue(stringValue(formData, "icon")),
    defaultDurationMinutes: duration === null ? null : Number(duration),
    defaultStartTime: optionalValue(stringValue(formData, "defaultStartTime")),
    description: optionalValue(stringValue(formData, "description")),
  };

  return activityCreateSchema.safeParse(raw);
}

export function activityFormValues(
  formData: FormData,
): ActivityFormState["values"] {
  return {
    name: stringValue(formData, "name"),
    color: stringValue(formData, "color"),
    icon: stringValue(formData, "icon"),
    defaultDurationMinutes: stringValue(formData, "defaultDurationMinutes"),
    defaultStartTime: stringValue(formData, "defaultStartTime"),
    description: stringValue(formData, "description"),
  };
}

export function validationFields(
  error: z.ZodError,
): ActivityFormState["fields"] {
  return error.flatten().fieldErrors as ActivityFormState["fields"];
}

export function friendlyActivityError(
  error: unknown,
  archivedDuplicate = false,
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return archivedDuplicate
      ? "Já existe uma atividade com esse nome. Verifique o filtro Arquivadas."
      : "Já existe uma atividade com esse nome.";
  }

  return "Não foi possível salvar a atividade. Tente novamente.";
}
