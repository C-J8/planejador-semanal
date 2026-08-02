import { z } from "zod";

const statusSchema = z.enum(["active", "archived", "all"]);

export function normalizeActivityQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 100);
}

export function normalizeActivityStatus(
  value: unknown,
): "active" | "archived" | "all" {
  const result = statusSchema.safeParse(value);
  return result.success ? result.data : "active";
}
