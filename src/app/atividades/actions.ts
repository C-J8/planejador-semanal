"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  activityFormToInput,
  activityFormValues,
  friendlyActivityError,
  type ActivityFormState,
  validationFields,
} from "@/modules/activities/lib/activity-form";
import { idSchema } from "@/shared/lib/domain-validation";
import { safeReturnTo } from "@/shared/lib/return-navigation";
import { revalidateActivityPaths } from "@/shared/lib/cache-invalidation";
import {
  archiveActivity,
  createActivity,
  findActivityByName,
  reactivateActivity,
  updateActivityAndPlannedOccurrences,
} from "@/modules/activities/services/activities";

export type ActivityStatusState = { message?: string };

async function duplicateIsArchived(name: string): Promise<boolean> {
  try {
    return (await findActivityByName(name))?.active === false;
  } catch {
    return false;
  }
}

export async function createActivityAction(
  _state: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const result = activityFormToInput(formData);
  if (!result.success) {
    return {
      message: "Revise os campos destacados.",
      fields: validationFields(result.error),
      values: activityFormValues(formData),
    };
  }

  try {
    await createActivity(result.data);
  } catch (error) {
    const message = friendlyActivityError(
      error,
      await duplicateIsArchived(result.data.name),
    );
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";
    return {
      message,
      fields: duplicate ? { name: [message] } : undefined,
      values: activityFormValues(formData),
    };
  }

  revalidateActivityPaths();
  redirect(
    safeReturnTo(
      formData.get("returnTo") ?? undefined,
      "/atividades?notice=created",
    ),
  );
}

export async function updateActivityAction(
  id: string,
  _state: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success)
    return { message: "Identificador da atividade inválido." };

  const result = activityFormToInput(formData);
  if (!result.success) {
    return {
      message: "Revise os campos destacados.",
      fields: validationFields(result.error),
      values: activityFormValues(formData),
    };
  }

  let active = true;
  try {
    const activity = await updateActivityAndPlannedOccurrences(
      parsedId.data,
      result.data,
    );
    active = activity.active;
  } catch (error) {
    const notFound =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025";
    const message = notFound
      ? "Atividade não encontrada."
      : friendlyActivityError(
          error,
          await duplicateIsArchived(result.data.name),
        );
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";
    return {
      message,
      fields: duplicate ? { name: [message] } : undefined,
      values: activityFormValues(formData),
    };
  }

  revalidateActivityPaths();
  redirect(
    `/atividades?status=${active ? "active" : "archived"}&notice=updated`,
  );
}

const statusActionSchema = z.object({
  id: idSchema,
  operation: z.enum(["archive", "reactivate"]),
});

export async function changeActivityStatusAction(
  _state: ActivityStatusState,
  formData: FormData,
): Promise<ActivityStatusState> {
  const result = statusActionSchema.safeParse({
    id: formData.get("id"),
    operation: formData.get("operation"),
  });
  if (!result.success)
    return { message: "Não foi possível identificar a atividade." };

  try {
    if (result.data.operation === "archive")
      await archiveActivity(result.data.id);
    else await reactivateActivity(result.data.id);
  } catch (error) {
    const notFound =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025";
    return {
      message: notFound
        ? "Atividade não encontrada."
        : "Não foi possível alterar a atividade. Tente novamente.",
    };
  }

  revalidateActivityPaths();
  const operation =
    result.data.operation === "archive" ? "archived" : "reactivated";
  redirect(`/atividades?notice=${operation}`);
}
