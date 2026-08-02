import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseCalendarDate,
  parseLocalTime,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import {
  idSchema,
  occurrenceCreateSchema,
  occurrenceEditSchema,
  occurrenceMoveSchema,
  occurrenceStatusSchema,
  occurrenceUpdateSchema,
} from "@/lib/domain-validation";
import { insertAtSafeIndex, normalizedPositions } from "@/lib/occurrence-order";
import {
  InvalidOccurrenceTransitionError,
  resolveOccurrenceTransition,
  type OccurrenceOperation,
} from "@/lib/occurrence-status";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/services/domain-error";

export type CreateOccurrenceInput = z.input<typeof occurrenceCreateSchema>;
export type UpdateOccurrenceInput = z.input<typeof occurrenceUpdateSchema>;
export type OccurrenceStatusInput = z.input<typeof occurrenceStatusSchema>;
export type EditOccurrenceInput = z.input<typeof occurrenceEditSchema>;

async function serializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      const retryable =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new DomainError("Não foi possível atualizar a ordem das ocorrências");
}

export function createOccurrence(input: CreateOccurrenceInput) {
  const data = occurrenceCreateSchema.parse(input);

  return serializableTransaction(async (transaction) => {
    const activity = await transaction.activity.findUnique({
      where: { id: data.activityId },
    });

    if (!activity) throw new DomainError("Atividade não encontrada");
    if (!activity.active)
      throw new DomainError("Não é possível agendar uma atividade arquivada");

    return transaction.activityOccurrence.create({
      data: {
        activityId: activity.id,
        scheduledDate: parseCalendarDate(data.scheduledDate),
        startTime:
          data.startTime === undefined
            ? activity.defaultStartTime
            : data.startTime === null
              ? null
              : parseLocalTime(data.startTime),
        durationMinutes:
          data.durationMinutes ?? activity.defaultDurationMinutes,
        position: data.position,
        notes: data.notes,
      },
    });
  });
}

export function createOccurrenceAtEnd(
  input: Omit<CreateOccurrenceInput, "position">,
) {
  const data = occurrenceCreateSchema.omit({ position: true }).parse(input);

  return serializableTransaction(async (transaction) => {
    const scheduledDate = parseCalendarDate(data.scheduledDate);
    const [activity, lastOccurrence] = await Promise.all([
      transaction.activity.findUnique({ where: { id: data.activityId } }),
      transaction.activityOccurrence.findFirst({
        where: { scheduledDate },
        orderBy: [{ position: "desc" }, { id: "desc" }],
        select: { position: true },
      }),
    ]);

    if (!activity) throw new DomainError("Atividade não encontrada");
    if (!activity.active)
      throw new DomainError(
        "Esta atividade está arquivada e não pode ser adicionada",
      );

    return transaction.activityOccurrence.create({
      data: {
        activityId: activity.id,
        scheduledDate,
        startTime:
          data.startTime === undefined
            ? activity.defaultStartTime
            : data.startTime === null
              ? null
              : parseLocalTime(data.startTime),
        durationMinutes:
          data.durationMinutes ?? activity.defaultDurationMinutes,
        position: (lastOccurrence?.position ?? -1) + 1,
        notes: data.notes,
      },
    });
  });
}

export function getOccurrence(id: string) {
  return prisma.activityOccurrence.findUnique({
    where: { id: idSchema.parse(id) },
    include: { activity: true },
  });
}

export function moveOccurrence(input: z.input<typeof occurrenceMoveSchema>) {
  const data = occurrenceMoveSchema.parse(input);

  return serializableTransaction(async (transaction) => {
    const occurrence = await transaction.activityOccurrence.findUnique({
      where: { id: data.occurrenceId },
    });
    if (!occurrence) throw new DomainError("Ocorrência não encontrada");

    const sourceDate = serializeCalendarDate(occurrence.scheduledDate);
    const sourceItems = await transaction.activityOccurrence.findMany({
      where: { scheduledDate: occurrence.scheduledDate },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    if (sourceDate === data.targetDate) {
      const ordered = insertAtSafeIndex(
        sourceItems.map(({ id }) => id),
        occurrence.id,
        data.targetIndex,
      );
      for (const item of normalizedPositions(ordered)) {
        await transaction.activityOccurrence.update({
          where: { id: item.id },
          data: { position: item.position },
        });
      }
    } else {
      const targetDate = parseCalendarDate(data.targetDate);
      const targetItems = await transaction.activityOccurrence.findMany({
        where: { scheduledDate: targetDate },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const sourceOrder = sourceItems
        .map(({ id }) => id)
        .filter((id) => id !== occurrence.id);
      const targetOrder = insertAtSafeIndex(
        targetItems.map(({ id }) => id),
        occurrence.id,
        data.targetIndex,
      );

      for (const item of normalizedPositions(sourceOrder)) {
        await transaction.activityOccurrence.update({
          where: { id: item.id },
          data: { position: item.position },
        });
      }
      for (const item of normalizedPositions(targetOrder)) {
        await transaction.activityOccurrence.update({
          where: { id: item.id },
          data: {
            scheduledDate: item.id === occurrence.id ? targetDate : undefined,
            recurrenceId: item.id === occurrence.id ? null : undefined,
            position: item.position,
          },
        });
      }
    }

    return transaction.activityOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
    });
  });
}

export async function editOccurrence(id: string, input: EditOccurrenceInput) {
  const occurrenceId = idSchema.parse(id);
  const data = occurrenceEditSchema.parse(input);
  const current = await prisma.activityOccurrence.findUnique({
    where: { id: occurrenceId },
  });
  if (!current) throw new DomainError("Ocorrência não encontrada");

  const identityChanged =
    serializeCalendarDate(current.scheduledDate) !== data.scheduledDate ||
    (current.startTime ? serializeLocalTime(current.startTime) : null) !==
      data.startTime ||
    current.durationMinutes !== data.durationMinutes;

  if (serializeCalendarDate(current.scheduledDate) !== data.scheduledDate) {
    const count = await prisma.activityOccurrence.count({
      where: { scheduledDate: parseCalendarDate(data.scheduledDate) },
    });
    await moveOccurrence({
      occurrenceId,
      targetDate: data.scheduledDate,
      targetIndex: count,
    });
  }

  return prisma.activityOccurrence.update({
    where: { id: occurrenceId },
    data: {
      startTime: data.startTime ? parseLocalTime(data.startTime) : null,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
      recurrenceId: identityChanged ? null : undefined,
    },
  });
}

export async function updateOccurrence(
  id: string,
  input: UpdateOccurrenceInput,
) {
  const occurrenceId = idSchema.parse(id);
  const data = occurrenceUpdateSchema.parse(input);
  const unlinksRecurrence =
    data.scheduledDate !== undefined ||
    data.startTime !== undefined ||
    data.durationMinutes !== undefined;

  return prisma.activityOccurrence.update({
    where: { id: occurrenceId },
    data: {
      ...data,
      scheduledDate: data.scheduledDate
        ? parseCalendarDate(data.scheduledDate)
        : undefined,
      startTime:
        data.startTime === undefined
          ? undefined
          : data.startTime === null
            ? null
            : parseLocalTime(data.startTime),
      recurrenceId: unlinksRecurrence ? null : undefined,
    },
  });
}

export function rescheduleOccurrence(id: string, scheduledDate: string) {
  return updateOccurrence(id, { scheduledDate });
}

export function changeOccurrenceStatus(
  id: string,
  status: OccurrenceStatusInput,
) {
  const nextStatus = occurrenceStatusSchema.parse(status);
  if (nextStatus === "COMPLETED") return completeOccurrence(id);
  if (nextStatus === "SKIPPED") return skipOccurrence(id);
  return reopenOccurrence(id);
}

async function transitionOccurrence(
  id: string,
  operation: OccurrenceOperation,
  now = new Date(),
) {
  const occurrenceId = idSchema.parse(id);
  const current = await prisma.activityOccurrence.findUnique({
    where: { id: occurrenceId },
  });
  if (!current) throw new DomainError("Ocorrência não encontrada");

  let transition;
  try {
    transition = resolveOccurrenceTransition(current, operation, now);
  } catch (error) {
    if (error instanceof InvalidOccurrenceTransitionError)
      throw new DomainError(error.message);
    throw error;
  }
  if (transition.kind === "idempotent") return current;

  const updated = await prisma.activityOccurrence.updateMany({
    where: { id: occurrenceId, status: transition.expectedStatus },
    data: {
      status: transition.status,
      completedAt: transition.completedAt,
    },
  });
  if (updated.count === 1)
    return prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: occurrenceId },
    });

  const latest = await prisma.activityOccurrence.findUnique({
    where: { id: occurrenceId },
  });
  if (!latest) throw new DomainError("Ocorrência não encontrada");
  try {
    const latestTransition = resolveOccurrenceTransition(
      latest,
      operation,
      now,
    );
    if (latestTransition.kind === "idempotent") return latest;
  } catch (error) {
    if (error instanceof InvalidOccurrenceTransitionError)
      throw new DomainError(error.message);
    throw error;
  }
  throw new DomainError(
    "Esta atividade foi atualizada em outra sessão. Recarregue a página.",
  );
}

export function completeOccurrence(id: string, now = new Date()) {
  return transitionOccurrence(id, "complete", now);
}

export function skipOccurrence(id: string) {
  return transitionOccurrence(id, "skip");
}

export function reopenOccurrence(id: string) {
  return transitionOccurrence(id, "reopen");
}

export function deleteOccurrence(id: string) {
  const occurrenceId = idSchema.parse(id);
  return serializableTransaction(async (transaction) => {
    const occurrence = await transaction.activityOccurrence.findUnique({
      where: { id: occurrenceId },
    });
    if (!occurrence) throw new DomainError("Ocorrência não encontrada");

    await transaction.activityOccurrence.delete({
      where: { id: occurrenceId },
    });
    const remaining = await transaction.activityOccurrence.findMany({
      where: { scheduledDate: occurrence.scheduledDate },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    for (const item of normalizedPositions(remaining.map(({ id }) => id))) {
      await transaction.activityOccurrence.update({
        where: { id: item.id },
        data: { position: item.position },
      });
    }
    return occurrence;
  });
}
