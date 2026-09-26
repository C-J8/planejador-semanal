import { z } from "zod";
import {
  eventCreateSchema,
  occurrenceEditSchema,
} from "@/shared/lib/domain-validation";

export type PlannerFormState = {
  message?: string;
  fields?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
}

function optional(value: string): string | null {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function occurrenceFormToInput(formData: FormData) {
  const duration = optional(value(formData, "durationMinutes"));
  return occurrenceEditSchema.safeParse({
    scheduledDate: value(formData, "scheduledDate"),
    startTime: optional(value(formData, "startTime")),
    durationMinutes: duration === null ? null : Number(duration),
    notes: optional(value(formData, "notes")),
  });
}

export function eventFormToInput(formData: FormData) {
  const duration = optional(value(formData, "durationMinutes"));
  return eventCreateSchema.safeParse({
    title: value(formData, "title"),
    eventDate: value(formData, "eventDate"),
    startTime: optional(value(formData, "startTime")),
    durationMinutes: duration === null ? null : Number(duration),
    description: optional(value(formData, "description")),
  });
}

export function plannerFormValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [
      "scheduledDate",
      "startTime",
      "durationMinutes",
      "notes",
      "title",
      "eventDate",
      "description",
    ].map((key) => [key, value(formData, key)]),
  );
}

export function plannerValidationFields(
  error: z.ZodError,
): PlannerFormState["fields"] {
  return error.flatten().fieldErrors;
}
