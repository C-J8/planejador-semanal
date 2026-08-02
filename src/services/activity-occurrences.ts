import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
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

    await moveOccurrenceInTransaction(transaction, occurrence, {
      targetDate: data.targetDate,
      targetIndex: data.targetIndex,
      unlinkRecurrenceOnDateChange: true,
    });

    return transaction.activityOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
    });
  });
}

type StoredOccurrence = {
  id: string;
  scheduledDate: Date;
};

type MoveWithinTransactionInput = {
  targetDate: string;
  targetIndex: number;
  unlinkRecurrenceOnDateChange: boolean;
};

export async function moveOccurrenceInTransaction(
  transaction: Prisma.TransactionClient,
  occurrence: StoredOccurrence,
  input: MoveWithinTransactionInput,
) {
  const sourceDate = serializeCalendarDate(occurrence.scheduledDate);
  const sameDate = sourceDate === input.targetDate;
  const [sourceItems, targetItems] = await Promise.all([
    transaction.activityOccurrence.findMany({
      where: { scheduledDate: occurrence.scheduledDate },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
    sameDate
      ? Promise.resolve([])
      : transaction.activityOccurrence.findMany({
          where: { scheduledDate: parseCalendarDate(input.targetDate) },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true },
        }),
  ]);
  const currentIndex = sourceItems.findIndex(({ id }) => id === occurrence.id);
  if (currentIndex < 0) throw new DomainError("Ocorrência não encontrada");
  const maximumIndex = sameDate ? sourceItems.length - 1 : targetItems.length;
  if (input.targetIndex > maximumIndex)
    throw new DomainError(`A posição deve estar entre 0 e ${maximumIndex}`);
  if (sameDate && currentIndex === input.targetIndex) return;

  if (sameDate) {
    await transaction.$executeRaw(Prisma.sql`
      WITH ordered AS (
        SELECT id,
          ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS compact_position
        FROM activity_occurrences
        WHERE scheduled_date = ${sourceDate}::date
          AND id <> ${occurrence.id}::uuid
      ), desired AS (
        SELECT id,
          CASE WHEN compact_position >= ${input.targetIndex}
            THEN compact_position + 1 ELSE compact_position END AS position
        FROM ordered
        UNION ALL
        SELECT ${occurrence.id}::uuid, ${input.targetIndex}::bigint
      )
      UPDATE activity_occurrences AS occurrence
      SET position = desired.position
      FROM desired
      WHERE occurrence.id = desired.id
    `);
    return;
  }

  await transaction.$executeRaw(Prisma.sql`
    WITH source_order AS (
      SELECT id,
        ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS position
      FROM activity_occurrences
      WHERE scheduled_date = ${sourceDate}::date
        AND id <> ${occurrence.id}::uuid
    ), target_order AS (
      SELECT id,
        CASE
          WHEN ROW_NUMBER() OVER (ORDER BY position, id) - 1 >= ${input.targetIndex}
            THEN ROW_NUMBER() OVER (ORDER BY position, id)
          ELSE ROW_NUMBER() OVER (ORDER BY position, id) - 1
        END AS position
      FROM activity_occurrences
      WHERE scheduled_date = ${input.targetDate}::date
    ), desired AS (
      SELECT id, position, ${sourceDate}::date AS scheduled_date
      FROM source_order
      UNION ALL
      SELECT id, position, ${input.targetDate}::date
      FROM target_order
      UNION ALL
      SELECT ${occurrence.id}::uuid, ${input.targetIndex}::bigint,
        ${input.targetDate}::date
    )
    UPDATE activity_occurrences AS occurrence
    SET scheduled_date = desired.scheduled_date,
        recurrence_id = CASE
          WHEN occurrence.id = ${occurrence.id}::uuid
               AND ${input.unlinkRecurrenceOnDateChange}
            THEN NULL
          ELSE occurrence.recurrence_id
        END,
        position = desired.position
    FROM desired
    WHERE occurrence.id = desired.id
  `);
}

export function editOccurrence(id: string, input: EditOccurrenceInput) {
  const occurrenceId = idSchema.parse(id);
  const data = occurrenceEditSchema.parse(input);
  return serializableTransaction((transaction) =>
    editOccurrenceInTransaction(transaction, occurrenceId, data),
  );
}

export async function editOccurrenceInTransaction(
  transaction: Prisma.TransactionClient,
  occurrenceId: string,
  data: z.output<typeof occurrenceEditSchema>,
) {
  const current = await transaction.activityOccurrence.findUnique({
    where: { id: occurrenceId },
  });
  if (!current) throw new DomainError("Ocorrência não encontrada");

  const activity = await transaction.activity.findUnique({
    where: { id: current.activityId },
    select: { id: true },
  });
  if (!activity) throw new DomainError("Atividade não encontrada");

  const dateChanged =
    serializeCalendarDate(current.scheduledDate) !== data.scheduledDate;
  const identityChanged =
    dateChanged ||
    (current.startTime ? serializeLocalTime(current.startTime) : null) !==
      data.startTime ||
    current.durationMinutes !== data.durationMinutes;

  if (dateChanged) {
    const targetCount = await transaction.activityOccurrence.count({
      where: { scheduledDate: parseCalendarDate(data.scheduledDate) },
    });
    await moveOccurrenceInTransaction(transaction, current, {
      targetDate: data.scheduledDate,
      targetIndex: targetCount,
      unlinkRecurrenceOnDateChange: false,
    });
  }

  return transaction.activityOccurrence.update({
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

    const date = serializeCalendarDate(occurrence.scheduledDate);
    await transaction.$executeRaw(Prisma.sql`
      WITH deleted AS (
        DELETE FROM activity_occurrences
        WHERE id = ${occurrenceId}::uuid
        RETURNING id
      ), ordered AS (
        SELECT occurrence.id,
          ROW_NUMBER() OVER (ORDER BY occurrence.position, occurrence.id) - 1
            AS compact_position
        FROM activity_occurrences AS occurrence
        CROSS JOIN deleted
        WHERE occurrence.scheduled_date = ${date}::date
          AND occurrence.id <> ${occurrenceId}::uuid
      )
      UPDATE activity_occurrences AS occurrence
      SET position = ordered.compact_position
      FROM ordered
      WHERE occurrence.id = ordered.id
    `);
    return occurrence;
  });
}
