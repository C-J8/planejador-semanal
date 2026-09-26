export type OccurrenceStatusValue = "PLANNED" | "COMPLETED" | "SKIPPED";
export type OccurrenceOperation = "complete" | "skip" | "reopen";

export type OccurrenceState = {
  status: OccurrenceStatusValue;
  completedAt: Date | null;
};

export type OccurrenceTransition =
  | { kind: "idempotent" }
  | {
      kind: "update";
      expectedStatus: OccurrenceStatusValue;
      status: OccurrenceStatusValue;
      completedAt: Date | null;
    };

export class InvalidOccurrenceTransitionError extends Error {
  constructor() {
    super("Reabra a atividade antes de alterar para esse estado.");
    this.name = "InvalidOccurrenceTransitionError";
  }
}

export function resolveOccurrenceTransition(
  state: OccurrenceState,
  operation: OccurrenceOperation,
  now = new Date(),
): OccurrenceTransition {
  if (operation === "reopen") {
    if (state.status === "PLANNED") return { kind: "idempotent" };
    return {
      kind: "update",
      expectedStatus: state.status,
      status: "PLANNED",
      completedAt: null,
    };
  }
  const target = operation === "complete" ? "COMPLETED" : "SKIPPED";
  if (state.status === target) return { kind: "idempotent" };
  if (state.status !== "PLANNED") throw new InvalidOccurrenceTransitionError();
  return {
    kind: "update",
    expectedStatus: "PLANNED",
    status: target,
    completedAt: target === "COMPLETED" ? now : null,
  };
}

export function summarizeOccurrenceStatuses(
  statuses: readonly OccurrenceStatusValue[],
) {
  const summary = { planned: 0, completed: 0, skipped: 0, total: 0 };
  for (const status of statuses) {
    summary.total += 1;
    if (status === "PLANNED") summary.planned += 1;
    if (status === "COMPLETED") summary.completed += 1;
    if (status === "SKIPPED") summary.skipped += 1;
  }
  return summary;
}

export const occurrenceStatusLabels: Record<OccurrenceStatusValue, string> = {
  PLANNED: "Planejada",
  COMPLETED: "Concluída",
  SKIPPED: "Pulada",
};
