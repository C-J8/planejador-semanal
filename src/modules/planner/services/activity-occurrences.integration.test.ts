import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  parseCalendarDate,
  serializeCalendarDate,
} from "@/shared/lib/calendar-values";
import { prisma } from "@/shared/lib/prisma";
import {
  deleteOccurrence,
  editOccurrenceInTransaction,
  moveOccurrence,
} from "@/modules/planner/services/activity-occurrences";
import { DomainError } from "@/shared/lib/domain-error";

const prefix = `stage9-${randomUUID()}`;
let activityId: string;
let countQueries = false;
let queryCount = 0;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  activityId = (
    await prisma.activity.create({
      data: { name: prefix, color: "#2563EB", defaultDurationMinutes: null },
    })
  ).id;
  const queryEvents = prisma as unknown as {
    $on(event: "query", callback: () => void): void;
  };
  queryEvents.$on("query", () => {
    if (countQueries) queryCount += 1;
  });
});

afterAll(async () => {
  await prisma.activityOccurrence.deleteMany({ where: { activityId } });
  await prisma.activity.deleteMany({ where: { id: activityId } });
  await prisma.$disconnect();
});

async function createDay(date: string, amount: number) {
  await prisma.activityOccurrence.createMany({
    data: Array.from({ length: amount }, (_, position) => ({
      activityId,
      scheduledDate: parseCalendarDate(date),
      position,
      durationMinutes: null,
      notes: `${prefix}-${date}-${position}`,
    })),
  });
  return prisma.activityOccurrence.findMany({
    where: { activityId, scheduledDate: parseCalendarDate(date) },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

async function order(date: string) {
  return prisma.activityOccurrence.findMany({
    where: { activityId, scheduledDate: parseCalendarDate(date) },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, position: true, notes: true },
  });
}

describe.sequential("ordenação em lote de ocorrências", () => {
  it("move para cima e para a primeira posição", async () => {
    const date = "2035-01-01";
    const items = await createDay(date, 4);
    await moveOccurrence({
      occurrenceId: items[3].id,
      targetDate: date,
      targetIndex: 0,
    });
    expect((await order(date)).map(({ id }) => id)).toEqual([
      items[3].id,
      items[0].id,
      items[1].id,
      items[2].id,
    ]);
    expect((await order(date)).map(({ position }) => position)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("move para baixo e para a última posição", async () => {
    const date = "2035-01-02";
    const items = await createDay(date, 4);
    await moveOccurrence({
      occurrenceId: items[0].id,
      targetDate: date,
      targetIndex: 3,
    });
    expect((await order(date)).map(({ id }) => id)).toEqual([
      items[1].id,
      items[2].id,
      items[3].id,
      items[0].id,
    ]);
  });

  it("trata movimento sem efeito e rejeita posição além do fim", async () => {
    const date = "2035-01-03";
    const items = await createDay(date, 3);
    const before = await order(date);
    await moveOccurrence({
      occurrenceId: items[1].id,
      targetDate: date,
      targetIndex: 1,
    });
    expect(await order(date)).toEqual(before);
    await expect(
      moveOccurrence({
        occurrenceId: items[1].id,
        targetDate: date,
        targetIndex: 3,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await order(date)).toEqual(before);
  });

  it("move para outro dia, compacta a origem e abre o destino", async () => {
    const source = "2035-01-04";
    const target = "2035-01-05";
    const sourceItems = await createDay(source, 3);
    const targetItems = await createDay(target, 2);
    await moveOccurrence({
      occurrenceId: sourceItems[1].id,
      targetDate: target,
      targetIndex: 1,
    });
    expect((await order(source)).map(({ id }) => id)).toEqual([
      sourceItems[0].id,
      sourceItems[2].id,
    ]);
    expect((await order(target)).map(({ id }) => id)).toEqual([
      targetItems[0].id,
      sourceItems[1].id,
      targetItems[1].id,
    ]);
  });

  it.each([
    ["início", 0],
    ["meio", 1],
    ["fim", 2],
  ])("exclui no %s e preserva/compacta os demais", async (_label, index) => {
    const date = `2035-02-0${index + 1}`;
    const items = await createDay(date, 3);
    await deleteOccurrence(items[index].id);
    const remaining = await order(date);
    expect(remaining.map(({ id }) => id)).toEqual(
      items.filter((_, itemIndex) => itemIndex !== index).map(({ id }) => id),
    );
    expect(remaining.map(({ position }) => position)).toEqual([0, 1]);
  });

  it("exclui o único item do dia", async () => {
    const date = "2035-02-04";
    const [item] = await createDay(date, 1);
    await deleteOccurrence(item.id);
    expect(await order(date)).toEqual([]);
  });

  it("mantém a quantidade de queries constante com 2 e 40 itens", async () => {
    const counts: number[] = [];
    for (const [date, amount] of [
      ["2035-03-01", 2],
      ["2035-03-02", 40],
    ] as const) {
      const items = await createDay(date, amount);
      queryCount = 0;
      countQueries = true;
      await moveOccurrence({
        occurrenceId: items.at(-1)!.id,
        targetDate: date,
        targetIndex: 0,
      });
      countQueries = false;
      counts.push(queryCount);
    }
    expect(counts[1]).toBe(counts[0]);
    expect(counts).toEqual([5, 5]);
    expect(counts[0]).toBeLessThanOrEqual(6);
  });

  it("mantém a exclusão constante com 2 e 40 itens", async () => {
    const counts: number[] = [];
    for (const [date, amount] of [
      ["2035-03-03", 2],
      ["2035-03-04", 40],
    ] as const) {
      const items = await createDay(date, amount);
      queryCount = 0;
      countQueries = true;
      await deleteOccurrence(items[0].id);
      countQueries = false;
      counts.push(queryCount);
    }
    expect(counts[1]).toBe(counts[0]);
    expect(counts).toEqual([3, 3]);
    expect(counts[0]).toBeLessThanOrEqual(4);
  });

  it("reverte data, posição e campos quando a etapa final falha", async () => {
    const source = "2035-04-01";
    const target = "2035-04-02";
    const [item] = await createDay(source, 1);
    const before = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: item.id },
    });

    await expect(
      prisma.$transaction(async (transaction) => {
        await editOccurrenceInTransaction(transaction, item.id, {
          scheduledDate: target,
          startTime: "12:30",
          durationMinutes: 50,
          notes: "não deve persistir",
        });
        throw new Error("falha antes do commit");
      }),
    ).rejects.toThrow("falha antes do commit");

    const after = await prisma.activityOccurrence.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(serializeCalendarDate(after.scheduledDate)).toBe(
      serializeCalendarDate(before.scheduledDate),
    );
    expect(after.position).toBe(before.position);
    expect(after.startTime).toEqual(before.startTime);
    expect(after.durationMinutes).toBe(before.durationMinutes);
    expect(after.notes).toBe(before.notes);
  });
});
