import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/lib/prisma";
import { CHESS_TIME_CLASSES } from "@/modules/chess/lib/progress-values";
import {
  ChessComApiError,
  chessUsernameSchema,
  fetchChessComProgress,
  type ChessProgress,
} from "@/modules/chess/integrations/chess-com";

const syncState = globalThis as typeof globalThis & {
  plannerChessSyncRunning?: boolean;
};

export async function syncChessProgress(usernameInput: string) {
  const username = chessUsernameSchema.parse(usernameInput);
  if (syncState.plannerChessSyncRunning)
    throw new ChessComApiError(
      "Uma atualização já está em andamento. Aguarde sua conclusão.",
    );
  syncState.plannerChessSyncRunning = true;
  try {
    const existing = await prisma.progressSource.findUnique({
      where: { provider: "CHESS_COM" },
    });
    if (
      existing?.lastSyncedAt &&
      Date.now() - existing.lastSyncedAt.getTime() < 300000
    ) {
      throw new ChessComApiError(
        "Os dados foram atualizados há poucos minutos. Aguarde cinco minutos entre atualizações.",
      );
    }
    try {
      const syncAt = new Date();
      const progress = await fetchChessComProgress(username, { now: syncAt });
      await saveChessProgress(progress, syncAt);
      return progress.observations.length;
    } catch (error) {
      if (existing?.displayName === username) {
        await prisma.progressSource.update({
          where: { id: existing.id },
          data: {
            lastSyncStatus: "ERROR",
            lastSyncError:
              error instanceof ChessComApiError
                ? error.message
                : "Não foi possível salvar a atualização. Tente novamente.",
          },
        });
      }
      throw error;
    }
  } finally {
    syncState.plannerChessSyncRunning = false;
  }
}

// External calls finish first. The recent window and statistics change together.
export async function saveChessProgress(
  progress: ChessProgress,
  now = new Date(),
) {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  );
  return prisma.$transaction(
    async (tx) => {
      // Serializes commits from multiple server processes without holding a lock during HTTP calls.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(735191)`;
      const existing = await tx.progressSource.findUnique({
        where: { provider: "CHESS_COM" },
      });
      if (
        existing &&
        existing.externalAccountId !== String(progress.playerId)
      ) {
        throw new ChessComApiError(
          "Já existe outra conta conectada. O histórico foi preservado; utilize a conta já cadastrada.",
        );
      }
      if (existing?.lastSyncedAt && existing.lastSyncedAt > now)
        return existing.id;
      const data = {
        externalAccountId: String(progress.playerId),
        displayName: progress.username,
        profileUrl: `https://www.chess.com/member/${progress.username}`,
        lastSyncedAt: now,
        lastSyncStatus: "SUCCESS" as const,
        lastSyncError: null,
        metadata: {
          importedFrom: windowStart.toISOString(),
          months: progress.months,
        },
      };
      const source = await tx.progressSource.upsert({
        where: { provider: "CHESS_COM" },
        create: { provider: "CHESS_COM", ...data },
        update: data,
      });
      for (const [index, mode] of CHESS_TIME_CLASSES.entries()) {
        const metric = await tx.progressMetric.upsert({
          where: { sourceId_key: { sourceId: source.id, key: mode.value } },
          create: {
            sourceId: source.id,
            key: mode.value,
            label: mode.label,
            color: mode.color,
            unit: "pontos",
            sortOrder: index,
            metadata: progress.stats[mode.value] ?? Prisma.JsonNull,
          },
          update: { metadata: progress.stats[mode.value] ?? Prisma.JsonNull },
        });
        await tx.progressObservation.deleteMany({
          where: {
            metricId: metric.id,
            observedAt: { gte: windowStart, lte: now },
          },
        });
        const points = progress.observations.filter(
          (point) =>
            point.timeClass === mode.value &&
            new Date(point.observedAt) >= windowStart &&
            new Date(point.observedAt) <= now,
        );
        for (let offset = 0; offset < points.length; offset += 1000) {
          await tx.progressObservation.createMany({
            data: points.slice(offset, offset + 1000).map((point) => ({
              metricId: metric.id,
              externalKey: point.externalKey,
              observedAt: new Date(point.observedAt),
              value: point.value,
            })),
            skipDuplicates: true,
          });
        }
      }
      return source.id;
    },
    { timeout: 30000 },
  );
}

export async function getChessDashboard() {
  return prisma.progressSource.findUnique({
    where: { provider: "CHESS_COM" },
    include: {
      metrics: {
        orderBy: { sortOrder: "asc" },
        include: {
          observations: {
            orderBy: [{ observedAt: "asc" }, { externalKey: "asc" }],
          },
        },
      },
    },
  });
}
