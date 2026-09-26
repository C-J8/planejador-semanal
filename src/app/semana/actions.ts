"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calendarDateSchema,
  normalizeWeekStart,
} from "@/shared/lib/calendar-values";
import { idSchema, occurrenceMoveSchema } from "@/shared/lib/domain-validation";
import { safeReturnTo } from "@/shared/lib/return-navigation";
import {
  revalidateEventPaths,
  revalidateOccurrencePaths,
} from "@/shared/lib/cache-invalidation";
import {
  eventFormToInput,
  occurrenceFormToInput,
  plannerFormValues,
  plannerValidationFields,
  type PlannerFormState,
} from "@/modules/planner/lib/planner-form";
import {
  createOccurrenceAtEnd,
  deleteOccurrence,
  editOccurrence,
  moveOccurrence,
} from "@/modules/planner/services/activity-occurrences";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/modules/planner/services/calendar-events";
import { DomainError } from "@/shared/lib/domain-error";

export type PlannerActionResult = { ok: boolean; message: string };

const addOccurrenceSchema = z.object({
  activityId: idSchema,
  date: calendarDateSchema,
});

function actionError(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Dados inválidos.";
  return "Não foi possível atualizar o planejamento. Tente novamente.";
}

export async function addOccurrenceAction(
  input: unknown,
): Promise<PlannerActionResult> {
  try {
    const data = addOccurrenceSchema.parse(input);
    await createOccurrenceAtEnd({
      activityId: data.activityId,
      scheduledDate: data.date,
    });
    revalidateOccurrencePaths();
    return { ok: true, message: "Atividade adicionada à semana." };
  } catch (error) {
    return { ok: false, message: actionError(error) };
  }
}

export async function moveOccurrenceAction(
  input: unknown,
): Promise<PlannerActionResult> {
  try {
    await moveOccurrence(occurrenceMoveSchema.parse(input));
    revalidateOccurrencePaths();
    return { ok: true, message: "Ocorrência movida." };
  } catch (error) {
    return { ok: false, message: actionError(error) };
  }
}

export async function deleteOccurrenceAction(
  id: string,
): Promise<PlannerActionResult> {
  try {
    await deleteOccurrence(idSchema.parse(id));
    revalidateOccurrencePaths();
    return { ok: true, message: "Ocorrência removida." };
  } catch (error) {
    return { ok: false, message: actionError(error) };
  }
}

export async function cancelEventAction(
  id: string,
): Promise<PlannerActionResult> {
  try {
    await cancelCalendarEvent(idSchema.parse(id));
    revalidateEventPaths();
    return { ok: true, message: "Evento cancelado." };
  } catch (error) {
    return { ok: false, message: actionError(error) };
  }
}

export async function deleteEventAction(
  id: string,
): Promise<PlannerActionResult> {
  try {
    await deleteCalendarEvent(idSchema.parse(id));
    revalidateEventPaths();
    return { ok: true, message: "Evento excluído." };
  } catch (error) {
    return { ok: false, message: actionError(error) };
  }
}

export async function updateOccurrenceAction(
  id: string,
  _state: PlannerFormState,
  formData: FormData,
): Promise<PlannerFormState> {
  const parsedId = idSchema.safeParse(id);
  const result = occurrenceFormToInput(formData);
  if (!parsedId.success) return { message: "Identificador inválido." };
  if (!result.success)
    return {
      message: "Revise os campos destacados.",
      fields: plannerValidationFields(result.error),
      values: plannerFormValues(formData),
    };

  try {
    await editOccurrence(parsedId.data, result.data);
  } catch (error) {
    return { message: actionError(error), values: plannerFormValues(formData) };
  }

  revalidateOccurrencePaths();
  redirect(
    `/semana?week=${normalizeWeekStart(result.data.scheduledDate)}&notice=occurrence-updated`,
  );
}

export async function createEventAction(
  _state: PlannerFormState,
  formData: FormData,
): Promise<PlannerFormState> {
  const result = eventFormToInput(formData);
  if (!result.success)
    return {
      message: "Revise os campos destacados.",
      fields: plannerValidationFields(result.error),
      values: plannerFormValues(formData),
    };
  try {
    await createCalendarEvent(result.data);
  } catch (error) {
    return { message: actionError(error), values: plannerFormValues(formData) };
  }
  revalidateEventPaths();
  const returnTo = safeReturnTo(
    formData.get("returnTo") ?? undefined,
    `/semana?week=${normalizeWeekStart(result.data.eventDate)}&notice=event-created`,
  );
  redirect(returnTo);
}

export async function updateEventAction(
  id: string,
  _state: PlannerFormState,
  formData: FormData,
): Promise<PlannerFormState> {
  const parsedId = idSchema.safeParse(id);
  const result = eventFormToInput(formData);
  if (!parsedId.success) return { message: "Identificador inválido." };
  if (!result.success)
    return {
      message: "Revise os campos destacados.",
      fields: plannerValidationFields(result.error),
      values: plannerFormValues(formData),
    };
  try {
    await updateCalendarEvent(parsedId.data, result.data);
  } catch (error) {
    return { message: actionError(error), values: plannerFormValues(formData) };
  }
  revalidateEventPaths();
  redirect(
    `/semana?week=${normalizeWeekStart(result.data.eventDate)}&notice=event-updated`,
  );
}
