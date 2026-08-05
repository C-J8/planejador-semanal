import type { Prisma } from "@/generated/prisma/client";
import {
  addCalendarDays,
  calendarDateSchema,
  currentCalendarDate,
  normalizeWeekStart,
  parseCalendarDate,
  parseLocalTime,
  serializeCalendarDate,
  serializeLocalTime,
} from "@/lib/calendar-values";
import { prisma } from "@/lib/prisma";
import {
  MAX_RECURRENCE_CANDIDATES,
  calculateRecurrenceDates,
  mapWeekday,
  planBatchMerge,
  recurrenceInputSchema,
  templateDetailsSchema,
  validateRecurrencePeriod,
  type BatchCandidate,
  type BatchPreviewItem,
} from "@/lib/weekly-resources";
import { idSchema } from "@/lib/domain-validation";
import { DomainError } from "@/services/domain-error";

async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (error) {
      const retryable =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new DomainError("Não foi possível concluir a operação concorrente");
}

function totals(items: BatchPreviewItem[]) {
  return {
    found: items.length,
    create: items.filter((item) => item.result === "CREATE").length,
    duplicate: items.filter((item) => item.result === "DUPLICATE").length,
    archived: items.filter((item) => item.result === "ARCHIVED").length,
    past: items.filter((item) => item.result === "PAST_DATE").length,
    conflicts: 0,
  };
}

export async function listPlanningActivityOptions() {
  const rows = await prisma.activity.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

async function existingForCandidates(
  client: Prisma.TransactionClient | typeof prisma,
  candidates: BatchCandidate[],
) {
  if (!candidates.length) return [];
  const dates = candidates.map((item) => item.scheduledDate).sort();
  const rows = await client.activityOccurrence.findMany({
    where: {
      scheduledDate: {
        gte: parseCalendarDate(dates[0]),
        lte: parseCalendarDate(dates.at(-1)!),
      },
      activityId: {
        in: [...new Set(candidates.map((item) => item.activityId))],
      },
    },
  });
  return rows.map((row) => ({
    activityId: row.activityId,
    scheduledDate: serializeCalendarDate(row.scheduledDate),
    startTime: row.startTime ? serializeLocalTime(row.startTime) : null,
    durationMinutes: row.durationMinutes,
  }));
}

async function persistPreview(
  tx: Prisma.TransactionClient,
  items: BatchPreviewItem[],
  recurrenceId?: string,
) {
  const creatable = items.filter((item) => item.result === "CREATE");
  if (!creatable.length) return 0;
  const dates = [...new Set(creatable.map((item) => item.scheduledDate))];
  const maximums = await tx.activityOccurrence.groupBy({
    by: ["scheduledDate"],
    where: { scheduledDate: { in: dates.map(parseCalendarDate) } },
    _max: { position: true },
  });
  const next = new Map(
    maximums.map((row) => [
      serializeCalendarDate(row.scheduledDate),
      (row._max.position ?? -1) + 1,
    ]),
  );
  await tx.activityOccurrence.createMany({
    data: creatable.map((item) => {
      const position = next.get(item.scheduledDate) ?? 0;
      next.set(item.scheduledDate, position + 1);
      return {
        activityId: item.activityId,
        scheduledDate: parseCalendarDate(item.scheduledDate),
        startTime: item.startTime ? parseLocalTime(item.startTime) : null,
        durationMinutes: item.durationMinutes,
        position,
        status: "PLANNED" as const,
        completedAt: null,
        recurrenceId,
      };
    }),
  });
  return creatable.length;
}

async function weekCopyCandidates(
  client: Prisma.TransactionClient | typeof prisma,
  sourceWeek: string,
  targetWeek: string,
) {
  const source = normalizeWeekStart(sourceWeek, sourceWeek);
  const target = normalizeWeekStart(targetWeek, targetWeek);
  const rows = await client.activityOccurrence.findMany({
    where: {
      scheduledDate: {
        gte: parseCalendarDate(source),
        lte: parseCalendarDate(addCalendarDays(source, 6)),
      },
    },
    include: { activity: true },
    orderBy: [{ scheduledDate: "asc" }, { position: "asc" }, { id: "asc" }],
  });
  return rows.map((row): BatchCandidate => ({
    itemKey: row.id,
    activityId: row.activityId,
    activityName: row.activity.name,
    archived: !row.activity.active,
    scheduledDate: mapWeekday(serializeCalendarDate(row.scheduledDate), target),
    startTime: row.startTime ? serializeLocalTime(row.startTime) : null,
    durationMinutes: row.durationMinutes,
    sourcePosition: row.position,
  }));
}

export async function copyWeek(
  sourceWeek: string,
  targetWeek: string,
  today = currentCalendarDate(),
) {
  return transaction(async (tx) => {
    const source = normalizeWeekStart(sourceWeek, sourceWeek);
    const target = normalizeWeekStart(targetWeek, targetWeek);
    if (source === target)
      throw new DomainError("Escolha uma semana de destino diferente");
    if (addCalendarDays(target, 6) < today)
      throw new DomainError(
        "Uma semana totalmente passada não pode ser destino",
      );
    const candidates = await weekCopyCandidates(tx, source, target);
    const current = planBatchMerge(
      candidates,
      await existingForCandidates(tx, candidates),
      today,
    );
    const created = await persistPreview(tx, current);
    if (!created) throw new DomainError("Nenhuma ocorrência nova foi criada");
    return created;
  });
}

async function templateItemsFromWeek(
  client: Prisma.TransactionClient | typeof prisma,
  weekStart: string,
) {
  const source = normalizeWeekStart(weekStart, weekStart);
  const rows = await client.activityOccurrence.findMany({
    where: {
      scheduledDate: {
        gte: parseCalendarDate(source),
        lte: parseCalendarDate(addCalendarDays(source, 6)),
      },
    },
    include: { activity: true },
    orderBy: [{ scheduledDate: "asc" }, { position: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    itemKey: row.id,
    activityId: row.activityId,
    activityName: row.activity.name,
    archived: !row.activity.active,
    weekday: Math.round(
      (row.scheduledDate.getTime() - parseCalendarDate(source).getTime()) /
        86_400_000,
    ),
    startTime: row.startTime ? serializeLocalTime(row.startTime) : null,
    durationMinutes: row.durationMinutes,
    position: row.position,
  }));
}

export function previewTemplateFromWeek(weekStart: string) {
  return templateItemsFromWeek(prisma, weekStart);
}

export async function saveWeekAsTemplate(weekStart: string, details: unknown) {
  const data = templateDetailsSchema.parse(details);
  return transaction(async (tx) => {
    const items = (await templateItemsFromWeek(tx, weekStart)).filter(
      (item) => !item.archived,
    );
    if (!items.length)
      throw new DomainError(
        "A semana não possui atividades elegíveis para o modelo",
      );
    return tx.weeklyTemplate.create({
      data: {
        name: data.name,
        description: data.description || null,
        items: {
          create: items.map((item) => ({
            activityId: item.activityId,
            weekday: item.weekday,
            startTime: item.startTime ? parseLocalTime(item.startTime) : null,
            durationMinutes: item.durationMinutes,
            position: item.position,
          })),
        },
      },
    });
  });
}

export async function listWeeklyTemplates() {
  const rows = await prisma.weeklyTemplate.findMany({
    include: {
      items: {
        include: { activity: true },
        orderBy: [{ weekday: "asc" }, { position: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      activityId: item.activityId,
      activityName: item.activity.name,
      archived: !item.activity.active,
      weekday: item.weekday,
      startTime: item.startTime ? serializeLocalTime(item.startTime) : null,
      durationMinutes: item.durationMinutes,
      position: item.position,
    })),
  }));
}

async function templateCandidates(
  client: Prisma.TransactionClient | typeof prisma,
  templateId: string,
  targetWeek: string,
) {
  const template = await client.weeklyTemplate.findUnique({
    where: { id: idSchema.parse(templateId) },
    include: {
      items: {
        include: { activity: true },
        orderBy: [{ weekday: "asc" }, { position: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!template) throw new DomainError("Modelo não encontrado");
  const target = normalizeWeekStart(targetWeek, targetWeek);
  return {
    template,
    candidates: template.items.map((item): BatchCandidate => ({
      itemKey: item.id,
      activityId: item.activityId,
      activityName: item.activity.name,
      archived: !item.activity.active,
      scheduledDate: addCalendarDays(target, item.weekday),
      startTime: item.startTime ? serializeLocalTime(item.startTime) : null,
      durationMinutes: item.durationMinutes,
      sourcePosition: item.position,
    })),
  };
}

export async function previewTemplateApplication(
  templateId: string,
  targetWeek: string,
  today = currentCalendarDate(),
) {
  const { template, candidates } = await templateCandidates(
    prisma,
    templateId,
    targetWeek,
  );
  const items = planBatchMerge(
    candidates,
    await existingForCandidates(prisma, candidates),
    today,
  );
  return {
    templateId: template.id,
    templateName: template.name,
    targetWeek: normalizeWeekStart(targetWeek, targetWeek),
    items,
    totals: totals(items),
  };
}

export async function applyWeeklyTemplate(
  templateId: string,
  targetWeek: string,
  today = currentCalendarDate(),
) {
  return transaction(async (tx) => {
    const { candidates } = await templateCandidates(tx, templateId, targetWeek);
    const current = planBatchMerge(
      candidates,
      await existingForCandidates(tx, candidates),
      today,
    );
    const created = await persistPreview(tx, current);
    if (!created)
      throw new DomainError("Nenhuma ocorrência elegível para aplicar");
    return created;
  });
}

export function updateWeeklyTemplate(id: string, details: unknown) {
  const data = templateDetailsSchema.parse(details);
  return prisma.weeklyTemplate.update({
    where: { id: idSchema.parse(id) },
    data: { name: data.name, description: data.description || null },
  });
}

export function deleteWeeklyTemplate(id: string) {
  return prisma.weeklyTemplate.delete({ where: { id: idSchema.parse(id) } });
}

export async function previewRecurrence(
  input: unknown,
  today = currentCalendarDate(),
) {
  const data = recurrenceInputSchema.parse(input);
  validateRecurrencePeriod(data, today);
  const activity = await prisma.activity.findUnique({
    where: { id: data.activityId },
  });
  if (!activity) throw new DomainError("Atividade não encontrada");
  if (!activity.active)
    throw new DomainError("Atividades arquivadas não podem gerar repetições");
  const dates = calculateRecurrenceDates(data);
  if (dates.length > MAX_RECURRENCE_CANDIDATES)
    throw new DomainError("A repetição excede 500 ocorrências candidatas");
  const candidates = dates.map((date): BatchCandidate => ({
    itemKey: date,
    activityId: activity.id,
    activityName: activity.name,
    archived: false,
    scheduledDate: date,
    startTime: data.startTime,
    durationMinutes: data.durationMinutes,
    sourcePosition: 0,
  }));
  const items = planBatchMerge(
    candidates,
    await existingForCandidates(prisma, candidates),
    today,
  );
  return { data, activityName: activity.name, items, totals: totals(items) };
}

export async function createRecurrence(
  input: unknown,
  today = currentCalendarDate(),
) {
  return transaction(async (tx) => {
    const data = recurrenceInputSchema.parse(input);
    validateRecurrencePeriod(data, today);
    const activity = await tx.activity.findUnique({
      where: { id: data.activityId },
    });
    if (!activity || !activity.active)
      throw new DomainError("A atividade precisa existir e estar ativa");
    const dates = calculateRecurrenceDates(data);
    if (dates.length > MAX_RECURRENCE_CANDIDATES)
      throw new DomainError("A repetição excede 500 ocorrências candidatas");
    const candidates = dates.map((date): BatchCandidate => ({
      itemKey: date,
      activityId: activity.id,
      activityName: activity.name,
      archived: false,
      scheduledDate: date,
      startTime: data.startTime,
      durationMinutes: data.durationMinutes,
      sourcePosition: 0,
    }));
    const current = planBatchMerge(
      candidates,
      await existingForCandidates(tx, candidates),
      today,
    );
    if (!current.some((item) => item.result === "CREATE"))
      throw new DomainError(
        "Nenhuma ocorrência elegível; a repetição não foi criada",
      );
    const rule = await tx.activityRecurrence.create({
      data: {
        activityId: data.activityId,
        startDate: parseCalendarDate(data.startDate),
        endDate: parseCalendarDate(data.endDate),
        weekdays: [...new Set(data.weekdays)].sort(),
        intervalWeeks: data.intervalWeeks,
        startTime: data.startTime ? parseLocalTime(data.startTime) : null,
        durationMinutes: data.durationMinutes,
      },
    });
    const created = await persistPreview(tx, current, rule.id);
    return { id: rule.id, created };
  });
}

export async function listRecurrences(today = currentCalendarDate()) {
  const rows = await prisma.activityRecurrence.findMany({
    include: { activity: true, _count: { select: { occurrences: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    activityName: row.activity.name,
    archived: !row.activity.active,
    startDate: serializeCalendarDate(row.startDate),
    endDate: serializeCalendarDate(row.endDate),
    weekdays: row.weekdays,
    intervalWeeks: row.intervalWeeks,
    startTime: row.startTime ? serializeLocalTime(row.startTime) : null,
    durationMinutes: row.durationMinutes,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledFromDate: row.cancelledFromDate
      ? serializeCalendarDate(row.cancelledFromDate)
      : null,
    createdCount: row._count.occurrences,
    state: row.cancelledAt
      ? "CANCELLED"
      : serializeCalendarDate(row.endDate) < today
        ? "ENDED"
        : "ACTIVE",
  }));
}

export async function previewRecurrenceCancellation(
  id: string,
  fromDate: string,
  today = currentCalendarDate(),
) {
  const recurrenceId = idSchema.parse(id);
  const validFromDate = calendarDateSchema.parse(fromDate);
  if (validFromDate < today)
    throw new DomainError("A data de efeito não pode estar no passado");
  const rule = await prisma.activityRecurrence.findUnique({
    where: { id: recurrenceId },
    include: { activity: true },
  });
  if (!rule) throw new DomainError("Repetição não encontrada");
  if (rule.cancelledAt)
    throw new DomainError("Esta repetição já foi cancelada");
  const removable = await prisma.activityOccurrence.findMany({
    where: {
      recurrenceId,
      scheduledDate: { gte: parseCalendarDate(validFromDate) },
      status: "PLANNED",
    },
    orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
  });
  return {
    recurrenceId,
    activityName: rule.activity.name,
    fromDate: validFromDate,
    removableDates: removable.map((item) =>
      serializeCalendarDate(item.scheduledDate),
    ),
    count: removable.length,
  };
}

export async function cancelRecurrence(
  id: string,
  fromDate: string,
  today = currentCalendarDate(),
) {
  return transaction(async (tx) => {
    const recurrenceId = idSchema.parse(id);
    const validFromDate = calendarDateSchema.parse(fromDate);
    if (validFromDate < today)
      throw new DomainError("A data de efeito não pode estar no passado");
    const rule = await tx.activityRecurrence.findUnique({
      where: { id: recurrenceId },
    });
    if (!rule) throw new DomainError("Repetição não encontrada");
    if (rule.cancelledAt)
      throw new DomainError("Esta repetição já foi cancelada");
    const removable = await tx.activityOccurrence.count({
      where: {
        recurrenceId,
        scheduledDate: { gte: parseCalendarDate(validFromDate) },
        status: "PLANNED",
      },
    });
    if (removable === 0)
      throw new DomainError(
        "Não há ocorrências planejadas removíveis nessa data ou depois dela",
      );
    const deleted = await tx.activityOccurrence.deleteMany({
      where: {
        recurrenceId,
        scheduledDate: { gte: parseCalendarDate(validFromDate) },
        status: "PLANNED",
      },
    });
    await tx.activityRecurrence.update({
      where: { id: recurrenceId },
      data: {
        cancelledAt: new Date(),
        cancelledFromDate: parseCalendarDate(validFromDate),
      },
    });
    return deleted.count;
  });
}
