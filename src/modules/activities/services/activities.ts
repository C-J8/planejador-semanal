import { z } from "zod";
import { parseLocalTime } from "@/shared/lib/calendar-values";
import {
  activityCreateSchema,
  activityUpdateSchema,
  idSchema,
} from "@/shared/lib/domain-validation";
import { prisma } from "@/shared/lib/prisma";

export type CreateActivityInput = z.input<typeof activityCreateSchema>;
export type UpdateActivityInput = z.input<typeof activityUpdateSchema>;
export type ActivityListStatus = "active" | "archived" | "all";

export type ListActivitiesInput = {
  query?: string;
  status?: ActivityListStatus;
};

export async function createActivity(input: CreateActivityInput) {
  const data = activityCreateSchema.parse(input);

  return prisma.activity.create({
    data: {
      ...data,
      defaultStartTime: data.defaultStartTime
        ? parseLocalTime(data.defaultStartTime)
        : null,
    },
  });
}

export async function updateActivity(id: string, input: UpdateActivityInput) {
  const activityId = idSchema.parse(id);
  const data = activityUpdateSchema.parse(input);

  return prisma.activity.update({
    where: { id: activityId },
    data: {
      ...data,
      defaultStartTime:
        data.defaultStartTime === undefined
          ? undefined
          : data.defaultStartTime === null
            ? null
            : parseLocalTime(data.defaultStartTime),
    },
  });
}

export async function updateActivityAndPlannedOccurrences(
  id: string,
  input: UpdateActivityInput,
) {
  const activityId = idSchema.parse(id);
  const data = activityUpdateSchema.parse(input);
  const nextStartTime =
    data.defaultStartTime === undefined
      ? undefined
      : data.defaultStartTime === null
        ? null
        : parseLocalTime(data.defaultStartTime);

  return prisma.$transaction(async (transaction) => {
    const current = await transaction.activity.findUniqueOrThrow({
      where: { id: activityId },
    });
    const activity = await transaction.activity.update({
      where: { id: activityId },
      data: {
        ...data,
        defaultStartTime: nextStartTime,
      },
    });

    if (
      data.defaultDurationMinutes !== undefined &&
      data.defaultDurationMinutes !== current.defaultDurationMinutes
    ) {
      await transaction.activityOccurrence.updateMany({
        where: {
          activityId,
          status: "PLANNED",
          durationMinutes: current.defaultDurationMinutes,
        },
        data: { durationMinutes: data.defaultDurationMinutes },
      });
    }

    if (
      nextStartTime !== undefined &&
      nextStartTime?.getTime() !== current.defaultStartTime?.getTime()
    ) {
      await transaction.activityOccurrence.updateMany({
        where: {
          activityId,
          status: "PLANNED",
          startTime: current.defaultStartTime,
        },
        data: { startTime: nextStartTime },
      });
    }

    return activity;
  });
}

export function archiveActivity(id: string) {
  return prisma.activity.update({
    where: { id: idSchema.parse(id) },
    data: { active: false, archivedAt: new Date() },
  });
}

export function reactivateActivity(id: string) {
  return prisma.activity.update({
    where: { id: idSchema.parse(id) },
    data: { active: true, archivedAt: null },
  });
}

export function getActivity(id: string) {
  return prisma.activity.findUnique({ where: { id: idSchema.parse(id) } });
}

export function findActivityByName(name: string) {
  return prisma.activity.findUnique({ where: { name } });
}

export function listActiveActivities() {
  return prisma.activity.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}

export function listActivities({
  query = "",
  status = "active",
}: ListActivitiesInput = {}) {
  return prisma.activity.findMany({
    where: {
      ...(status === "active" ? { active: true } : {}),
      ...(status === "archived" ? { active: false } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              {
                description: { contains: query, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}
