import { z } from "zod";
import { calendarDateSchema, localTimeSchema } from "@/lib/calendar-values";

export const idSchema = z.string().uuid("O identificador informado é inválido");

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum, `Use no máximo ${maximum} caracteres`)
    .nullable()
    .optional();

export const nameSchema = z
  .string()
  .trim()
  .min(1, "O nome da atividade é obrigatório")
  .max(100, "O nome deve ter no máximo 100 caracteres");

export const eventTitleSchema = z
  .string()
  .trim()
  .min(1, "O título do evento é obrigatório")
  .max(200, "O título deve ter no máximo 200 caracteres");

export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "A cor deve estar no formato #RRGGBB")
  .transform((color) => color.toUpperCase());

export const durationSchema = z
  .number({ error: "A duração deve ser um número" })
  .int("A duração deve ser um número inteiro")
  .positive("A duração deve ser positiva")
  .max(10080, "A duração deve ser de no máximo 10080 minutos");

export const positionSchema = z
  .number()
  .int("A posição deve ser um número inteiro")
  .nonnegative("A posição não pode ser negativa")
  .max(1000000, "A posição excede o limite permitido");

export const activityCreateSchema = z.object({
  name: nameSchema,
  color: colorSchema,
  icon: optionalText(32),
  defaultDurationMinutes: durationSchema.nullable(),
  defaultStartTime: localTimeSchema.nullable().optional(),
  description: optionalText(2000),
});

export const activityUpdateSchema = activityCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe pelo menos um campo para atualizar",
  );

export const occurrenceCreateSchema = z.object({
  activityId: idSchema,
  scheduledDate: calendarDateSchema,
  startTime: localTimeSchema.nullable().optional(),
  durationMinutes: durationSchema.optional(),
  position: positionSchema.default(0),
  notes: optionalText(2000),
});

export const occurrenceUpdateSchema = z
  .object({
    scheduledDate: calendarDateSchema.optional(),
    startTime: localTimeSchema.nullable().optional(),
    durationMinutes: durationSchema.optional(),
    position: positionSchema.optional(),
    notes: optionalText(2000),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe pelo menos um campo para atualizar",
  );

export const occurrenceStatusSchema = z.enum([
  "PLANNED",
  "COMPLETED",
  "SKIPPED",
]);

export const occurrenceMoveSchema = z.object({
  occurrenceId: idSchema,
  targetDate: calendarDateSchema,
  targetIndex: positionSchema,
});

export const occurrenceEditSchema = z.object({
  scheduledDate: calendarDateSchema,
  startTime: localTimeSchema.nullable(),
  durationMinutes: durationSchema.nullable(),
  notes: optionalText(2000),
});

export const eventCreateSchema = z.object({
  title: eventTitleSchema,
  eventDate: calendarDateSchema,
  startTime: localTimeSchema.nullable().optional(),
  durationMinutes: durationSchema.nullable().optional(),
  description: optionalText(2000),
});

export const eventUpdateSchema = z
  .object({
    title: eventTitleSchema.optional(),
    eventDate: calendarDateSchema.optional(),
    startTime: localTimeSchema.nullable().optional(),
    durationMinutes: durationSchema.nullable().optional(),
    description: optionalText(2000),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe pelo menos um campo para atualizar",
  );
