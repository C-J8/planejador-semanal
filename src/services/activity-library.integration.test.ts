import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeLocalTime } from "@/lib/calendar-values";
import { prisma } from "@/lib/prisma";
import {
  archiveActivity,
  createActivity,
  getActivity,
  listActiveActivities,
  listActivities,
  reactivateActivity,
  updateActivity,
} from "@/services/activities";
import { createOccurrence } from "@/services/activity-occurrences";

const activityIds: string[] = [];
const occurrenceIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Os testes da biblioteca exigem PostgreSQL disponível: ${error instanceof Error ? error.message : "falha desconhecida"}`,
    );
  }
});

afterAll(async () => {
  if (occurrenceIds.length > 0) {
    await prisma.activityOccurrence.deleteMany({
      where: { id: { in: occurrenceIds } },
    });
  }
  if (activityIds.length > 0) {
    await prisma.activity.deleteMany({ where: { id: { in: activityIds } } });
  }
  await prisma.$disconnect();
});

describe.sequential("biblioteca de atividades no PostgreSQL", () => {
  const originalName = `Biblioteca ${randomUUID()}`;
  const updatedName = `Estudo ${randomUUID()}`;
  let activityId: string;
  let occurrenceId: string;

  it("cria, consulta e persiste uma atividade em uma nova consulta", async () => {
    const created = await createActivity({
      name: originalName,
      color: "#3B82F6",
      icon: "📘",
      defaultDurationMinutes: 45,
      defaultStartTime: null,
      description: "Atividade temporária",
    });
    activityId = created.id;
    activityIds.push(created.id);

    const queried = await getActivity(created.id);
    expect(queried?.name).toBe(originalName);
  });

  it("atualiza todos os campos permitidos", async () => {
    const updated = await updateActivity(activityId, {
      name: updatedName,
      color: "#8B5CF6",
      icon: "📚",
      defaultDurationMinutes: 60,
      defaultStartTime: "19:15",
      description: "Descrição atualizada",
    });

    expect(updated.name).toBe(updatedName);
    expect(updated.color).toBe("#8B5CF6");
    expect(updated.icon).toBe("📚");
    expect(updated.defaultDurationMinutes).toBe(60);
    expect(serializeLocalTime(updated.defaultStartTime!)).toBe("19:15");
    expect(updated.description).toBe("Descrição atualizada");
  });

  it("pesquisa pelo nome sem diferenciar maiúsculas", async () => {
    const results = await listActivities({
      query: updatedName.toUpperCase(),
      status: "all",
    });
    expect(results.map((activity) => activity.id)).toContain(activityId);
  });

  it("lista somente atividades ativas em ordem previsível", async () => {
    const active = await listActiveActivities();
    expect(active.every((activity) => activity.active)).toBe(true);
    expect(active.map((activity) => activity.id)).toContain(activityId);
    expect(active.map((activity) => activity.name)).toEqual(
      [...active.map((activity) => activity.name)].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  it("preserva ocorrência e snapshot ao editar e arquivar", async () => {
    const occurrence = await createOccurrence({
      activityId,
      scheduledDate: "2026-09-10",
    });
    occurrenceId = occurrence.id;
    occurrenceIds.push(occurrence.id);

    await updateActivity(activityId, {
      defaultDurationMinutes: 90,
      defaultStartTime: "20:30",
    });
    await archiveActivity(activityId);

    const persisted = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: occurrenceId },
    });
    expect(persisted.durationMinutes).toBe(60);
    expect(serializeLocalTime(persisted.startTime!)).toBe("19:15");
  });

  it("retira arquivadas das ativas e as inclui no filtro correspondente", async () => {
    expect(
      (await listActiveActivities()).map((activity) => activity.id),
    ).not.toContain(activityId);
    expect(
      (await listActivities({ status: "archived" })).map(
        (activity) => activity.id,
      ),
    ).toContain(activityId);
  });

  it("reativa e devolve a atividade à consulta de ativas", async () => {
    await reactivateActivity(activityId);
    expect(
      (await listActiveActivities()).map((activity) => activity.id),
    ).toContain(activityId);
  });

  it("rejeita nome duplicado e preserva atividades do seed", async () => {
    await expect(
      createActivity({
        name: updatedName,
        color: "#EF4444",
        defaultDurationMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const seedNames = await prisma.activity.findMany({
      where: { name: { in: ["Academia", "Leitura", "Sono"] } },
      select: { name: true },
    });
    expect(seedNames.map(({ name }) => name).sort()).toEqual([
      "Academia",
      "Leitura",
      "Sono",
    ]);
  });
});
