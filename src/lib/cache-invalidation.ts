import { revalidatePath } from "next/cache";

const OCCURRENCE_PATHS = [
  "/semana",
  "/dia",
  "/mes",
  "/acompanhamento",
  "/repeticoes",
] as const;

const ACTIVITY_PATHS = [
  "/atividades",
  "/semana",
  "/dia",
  "/mes",
  "/acompanhamento",
  "/modelos",
  "/repeticoes",
] as const;

const EVENT_PATHS = ["/semana", "/dia", "/mes"] as const;

function revalidatePaths(paths: readonly string[]) {
  for (const path of paths) revalidatePath(path);
}

export function revalidateOccurrencePaths() {
  revalidatePaths(OCCURRENCE_PATHS);
}

export function revalidateActivityPaths() {
  revalidatePaths(ACTIVITY_PATHS);
}

export function revalidateEventPaths() {
  revalidatePaths(EVENT_PATHS);
}
