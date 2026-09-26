import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import {
  applyWeeklyTemplate,
  cancelRecurrence,
  copyWeek,
  createRecurrence,
  deleteWeeklyTemplate,
  previewRecurrence,
  previewRecurrenceCancellation,
  previewTemplateApplication,
  saveWeekAsTemplate,
} from "@/modules/planner/services/weekly-resources";
import {
  completeOccurrence,
  editOccurrence,
  skipOccurrence,
} from "@/modules/planner/services/activity-occurrences";
import {
  parseCalendarDate,
  parseLocalTime,
} from "@/shared/lib/calendar-values";

describe("Stage 8 no PostgreSQL", () => {
  const marker = `Stage8 ${crypto.randomUUID()}`;
  let activityId = "";
  let archivedActivityId = "";
  const source = "2026-08-03";
  const target = "2026-08-10";

  beforeAll(async () => {
    const [activity, archived] = await Promise.all([
      prisma.activity.create({
        data: {
          name: `${marker} ativa`,
          color: "#123456",
          defaultDurationMinutes: 30,
        },
      }),
      prisma.activity.create({
        data: {
          name: `${marker} arquivada`,
          color: "#654321",
          defaultDurationMinutes: 20,
          active: false,
          archivedAt: new Date(),
        },
      }),
    ]);
    activityId = activity.id;
    archivedActivityId = archived.id;
    await prisma.activityOccurrence.createMany({
      data: [
        {
          activityId,
          scheduledDate: parseCalendarDate("2026-08-05"),
          startTime: parseLocalTime("18:30"),
          durationMinutes: 60,
          position: 0,
          status: "COMPLETED",
          completedAt: new Date(),
        },
        {
          activityId,
          scheduledDate: parseCalendarDate("2026-08-07"),
          startTime: null,
          durationMinutes: null,
          position: 0,
          status: "SKIPPED",
        },
        {
          activityId,
          scheduledDate: parseCalendarDate("2026-08-07"),
          startTime: null,
          durationMinutes: null,
          position: 1,
        },
        {
          activityId: archivedActivityId,
          scheduledDate: parseCalendarDate("2026-08-06"),
          durationMinutes: 20,
          position: 0,
        },
        {
          activityId,
          scheduledDate: parseCalendarDate("2026-08-14"),
          startTime: null,
          durationMinutes: null,
          position: 0,
        },
      ],
    });
    await prisma.calendarEvent.create({
      data: { title: marker, eventDate: parseCalendarDate("2026-08-05") },
    });
  });

  afterAll(async () => {
    await prisma.activityOccurrence.deleteMany({
      where: { activityId: { in: [activityId, archivedActivityId] } },
    });
    await prisma.activityRecurrence.deleteMany({
      where: { activityId: { in: [activityId, archivedActivityId] } },
    });
    await prisma.weeklyTemplateItem.deleteMany({
      where: { activityId: { in: [activityId, archivedActivityId] } },
    });
    await prisma.weeklyTemplate.deleteMany({
      where: { name: { startsWith: marker } },
    });
    await prisma.calendarEvent.deleteMany({ where: { title: marker } });
    await prisma.activity.deleteMany({
      where: { id: { in: [activityId, archivedActivityId] } },
    });
    await prisma.$disconnect();
  });

  it("copia por multiplicidade, reinicia execução, preserva null, ignora arquivada e evento", async () => {
    expect(await copyWeek(source, target, "2026-08-01")).toBe(2);
    const copied = await prisma.activityOccurrence.findMany({
      where: {
        activityId,
        scheduledDate: {
          gte: parseCalendarDate(target),
          lte: parseCalendarDate("2026-08-16"),
        },
      },
    });
    expect(copied).toHaveLength(3);
    expect(
      copied.every(
        (item) => item.status === "PLANNED" && item.completedAt === null,
      ),
    ).toBe(true);
    expect(copied.filter((item) => item.durationMinutes === null)).toHaveLength(
      2,
    );
    await expect(copyWeek(source, target, "2026-08-01")).rejects.toThrow(
      /Nenhuma/,
    );
    expect(await prisma.calendarEvent.count({ where: { title: marker } })).toBe(
      1,
    );
  });

  it("salva e aplica modelo idempotente preservando itens e ocorrências", async () => {
    const template = await saveWeekAsTemplate(source, {
      name: `${marker} modelo`,
      description: "snapshot",
    });
    const items = await prisma.weeklyTemplateItem.findMany({
      where: { weeklyTemplateId: template.id },
    });
    expect(items).toHaveLength(3);
    expect(items.filter((item) => item.durationMinutes === null)).toHaveLength(
      2,
    );
    const week = "2026-08-24";
    expect(
      (await previewTemplateApplication(template.id, week, "2026-08-01")).totals
        .create,
    ).toBe(3);
    expect(await applyWeeklyTemplate(template.id, week, "2026-08-01")).toBe(3);
    await expect(
      applyWeeklyTemplate(template.id, week, "2026-08-01"),
    ).rejects.toThrow(/Nenhuma/);
    await prisma.activity.update({
      where: { id: activityId },
      data: { active: false, archivedAt: new Date() },
    });
    const archivedPreview = await previewTemplateApplication(
      template.id,
      "2026-08-31",
      "2026-08-01",
    );
    expect(archivedPreview.totals.archived).toBe(3);
    await deleteWeeklyTemplate(template.id);
    expect(
      await prisma.activityOccurrence.count({
        where: {
          activityId,
          scheduledDate: {
            gte: parseCalendarDate(week),
            lte: parseCalendarDate("2026-08-30"),
          },
        },
      }),
    ).toBe(3);
    await prisma.activity.update({
      where: { id: activityId },
      data: { active: true, archivedAt: null },
    });
  });

  it("materializa repetição quinzenal e não persiste regra vazia", async () => {
    const input = {
      activityId,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      weekdays: [1, 3],
      intervalWeeks: 2,
      startTime: "07:15",
      durationMinutes: null,
    };
    const preview = await previewRecurrence(input, "2026-08-01");
    expect(preview.items.map((item) => item.scheduledDate)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-15",
      "2026-09-17",
      "2026-09-29",
    ]);
    const created = await createRecurrence(input, "2026-08-01");
    expect(created.created).toBe(5);
    const rows = await prisma.activityOccurrence.findMany({
      where: { recurrenceId: created.id },
    });
    expect(rows).toHaveLength(5);
    expect(
      rows.every(
        (item) => item.status === "PLANNED" && item.durationMinutes === null,
      ),
    ).toBe(true);
    const before = await prisma.activityRecurrence.count({
      where: { activityId },
    });
    await expect(createRecurrence(input, "2026-08-01")).rejects.toThrow(
      /não foi criada/,
    );
    expect(
      await prisma.activityRecurrence.count({ where: { activityId } }),
    ).toBe(before);
  });

  it("desvincula edição individual e cancela somente futuras planejadas vinculadas", async () => {
    const result = await createRecurrence(
      {
        activityId,
        startDate: "2026-10-05",
        endDate: "2026-10-26",
        weekdays: [0],
        intervalWeeks: 1,
        startTime: null,
        durationMinutes: 30,
      },
      "2026-08-01",
    );
    const rows = await prisma.activityOccurrence.findMany({
      where: { recurrenceId: result.id },
      orderBy: { scheduledDate: "asc" },
    });
    await editOccurrence(rows[0].id, {
      scheduledDate: "2026-10-06",
      startTime: null,
      durationMinutes: 45,
      notes: null,
    });
    await completeOccurrence(rows[1].id);
    await skipOccurrence(rows[2].id);
    expect(
      await prisma.activityOccurrence.findMany({
        where: { id: { in: [rows[1].id, rows[2].id] } },
        select: { recurrenceId: true },
      }),
    ).toEqual([{ recurrenceId: result.id }, { recurrenceId: result.id }]);
    const preview = await previewRecurrenceCancellation(
      result.id,
      "2026-10-05",
      "2026-08-01",
    );
    expect(preview.count).toBe(1);
    expect(await cancelRecurrence(result.id, "2026-10-05", "2026-08-01")).toBe(
      1,
    );
    expect(
      await prisma.activityOccurrence.findUnique({ where: { id: rows[0].id } }),
    ).toMatchObject({ recurrenceId: null, durationMinutes: 45 });
    expect(
      await prisma.activityOccurrence.findUnique({ where: { id: rows[1].id } }),
    ).toMatchObject({ status: "COMPLETED" });
    expect(
      await prisma.activityOccurrence.findUnique({ where: { id: rows[2].id } }),
    ).toMatchObject({ status: "SKIPPED" });
    await expect(
      cancelRecurrence(result.id, "2026-10-05", "2026-08-01"),
    ).rejects.toThrow(/já foi cancelada/);
  });

  it("não cancela nem anuncia sucesso quando nada é removível", async () => {
    const result = await createRecurrence(
      {
        activityId,
        startDate: "2026-11-16",
        endDate: "2026-11-16",
        weekdays: [0],
        intervalWeeks: 1,
        startTime: null,
        durationMinutes: null,
      },
      "2026-08-01",
    );
    const occurrence = await prisma.activityOccurrence.findFirstOrThrow({
      where: { recurrenceId: result.id },
    });
    await completeOccurrence(occurrence.id);
    await expect(
      cancelRecurrence(result.id, "2026-11-16", "2026-08-01"),
    ).rejects.toThrow(/Não há ocorrências/);
    expect(
      await prisma.activityRecurrence.findUnique({ where: { id: result.id } }),
    ).toMatchObject({ cancelledAt: null, cancelledFromDate: null });
  });
});
