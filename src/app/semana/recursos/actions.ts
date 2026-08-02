"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { calendarDateSchema, normalizeWeekStart } from "@/lib/calendar-values";
import { idSchema } from "@/lib/domain-validation";
import {
  recurrenceInputSchema,
  templateDetailsSchema,
} from "@/lib/weekly-resources";
import {
  applyWeeklyTemplate,
  cancelRecurrence,
  copyWeek,
  createRecurrence,
  deleteWeeklyTemplate,
  saveWeekAsTemplate,
  updateWeeklyTemplate,
} from "@/services/weekly-resources";
import { DomainError } from "@/services/domain-error";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Dados inválidos";
  if (error instanceof DomainError) return error.message;
  return "Não foi possível concluir a operação";
}

function refreshStage8() {
  for (const path of [
    "/semana",
    "/dia",
    "/mes",
    "/acompanhamento",
    "/modelos",
    "/repeticoes",
  ])
    revalidatePath(path);
}

function fail(path: string, error: unknown): never {
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(errorMessage(error))}`,
  );
}

export async function confirmWeekCopyAction(formData: FormData) {
  const source = normalizeWeekStart(field(formData, "sourceWeek"));
  const target = normalizeWeekStart(field(formData, "targetWeek"));
  let created: number;
  try {
    created = await copyWeek(source, target);
  } catch (error) {
    fail(`/semana/recursos?mode=copy&source=${source}&target=${target}`, error);
  }
  refreshStage8();
  redirect(
    `/semana?week=${target}&notice=${encodeURIComponent(`${created} ocorrência(s) copiada(s).`)}`,
  );
}

export async function saveTemplateAction(formData: FormData) {
  const week = normalizeWeekStart(field(formData, "week"));
  try {
    const details = templateDetailsSchema.parse({
      name: field(formData, "name"),
      description: field(formData, "description") || null,
    });
    await saveWeekAsTemplate(week, details);
  } catch (error) {
    fail(`/semana/recursos?mode=save-template&week=${week}`, error);
  }
  refreshStage8();
  redirect("/modelos?notice=Modelo%20salvo.");
}

export async function applyTemplateAction(formData: FormData) {
  const rawId = field(formData, "templateId");
  const target = normalizeWeekStart(field(formData, "targetWeek"));
  let id = rawId;
  let created: number;
  try {
    id = idSchema.parse(rawId);
    created = await applyWeeklyTemplate(id, target);
  } catch (error) {
    fail(
      `/semana/recursos?mode=apply-template&template=${id}&target=${target}`,
      error,
    );
  }
  refreshStage8();
  redirect(
    `/semana?week=${target}&notice=${encodeURIComponent(`${created} ocorrência(s) criadas pelo modelo.`)}`,
  );
}

export async function createRecurrenceAction(formData: FormData) {
  const duration = field(formData, "durationMinutes");
  const raw = {
    activityId: field(formData, "activityId"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    weekdays: formData.getAll("weekdays").map(Number),
    intervalWeeks: Number(field(formData, "intervalWeeks")),
    startTime: field(formData, "startTime") || null,
    durationMinutes: duration ? Number(duration) : null,
  };
  let created = 0;
  try {
    const data = recurrenceInputSchema.parse(raw);
    const result = await createRecurrence(data);
    created = result.created;
  } catch (error) {
    const params = new URLSearchParams({
      mode: "recurrence",
      activity: raw.activityId,
      start: raw.startDate,
      end: raw.endDate,
      interval: String(raw.intervalWeeks),
      time: raw.startTime ?? "",
      duration,
    });
    raw.weekdays.forEach((day) => params.append("days", String(day)));
    fail(`/semana/recursos?${params}`, error);
  }
  refreshStage8();
  redirect(
    `/repeticoes?notice=${encodeURIComponent(`Repetição criada com ${created} ocorrência(s).`)}`,
  );
}

export async function updateTemplateAction(id: string, formData: FormData) {
  try {
    await updateWeeklyTemplate(id, {
      name: field(formData, "name"),
      description: field(formData, "description") || null,
    });
  } catch (error) {
    fail("/modelos", error);
  }
  refreshStage8();
  redirect("/modelos?notice=Modelo%20atualizado.");
}

export async function deleteTemplateAction(id: string) {
  try {
    await deleteWeeklyTemplate(id);
  } catch (error) {
    fail("/modelos", error);
  }
  refreshStage8();
  redirect("/modelos?notice=Modelo%20excluído.");
}

export async function cancelRecurrenceAction(id: string, formData: FormData) {
  const rawFrom = field(formData, "fromDate");
  let from = rawFrom;
  let count: number;
  try {
    from = calendarDateSchema.parse(rawFrom);
    count = await cancelRecurrence(idSchema.parse(id), from);
  } catch (error) {
    fail(`/repeticoes?cancel=${id}&from=${from}`, error);
  }
  refreshStage8();
  redirect(
    `/repeticoes?notice=${encodeURIComponent(`Repetição cancelada; ${count} ocorrência(s) removida(s).`)}`,
  );
}
