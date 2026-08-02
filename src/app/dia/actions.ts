"use server";

import { z } from "zod";
import { revalidateOccurrencePaths } from "@/lib/cache-invalidation";
import { idSchema } from "@/lib/domain-validation";
import {
  completeOccurrence,
  reopenOccurrence,
  skipOccurrence,
} from "@/services/activity-occurrences";
import { DomainError } from "@/services/domain-error";

export type DailyActionResult = { ok: boolean; message: string };

function errorMessage(error: unknown) {
  if (error instanceof DomainError) return error.message;
  if (error instanceof z.ZodError) return "Identificador inválido.";
  return "Não foi possível atualizar a atividade. Tente novamente.";
}

async function runAction(
  id: string,
  operation: (validId: string) => Promise<unknown>,
  successMessage: string,
): Promise<DailyActionResult> {
  try {
    await operation(idSchema.parse(id));
    revalidateOccurrencePaths();
    return { ok: true, message: successMessage };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function completeOccurrenceAction(id: string) {
  return await runAction(id, completeOccurrence, "Atividade concluída.");
}

export async function skipOccurrenceAction(id: string) {
  return await runAction(id, skipOccurrence, "Atividade marcada como pulada.");
}

export async function reopenOccurrenceAction(id: string) {
  return await runAction(id, reopenOccurrence, "Atividade reaberta.");
}
