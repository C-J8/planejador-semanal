import "server-only";
import { z } from "zod";
import {
  CHESS_TIME_CLASS_VALUES,
  type ChessTimeClass,
} from "@/modules/chess/lib/progress-values";

export class ChessComApiError extends Error {}

export const chessUsernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, "Informe apenas o nome de usuário do Chess.com.")
  .transform((value) => value.toLowerCase());

const rating = z.number().int().nonnegative().max(10000);
const epoch = z.number().int().nonnegative().max(253402300799);
const snapshot = z.object({ rating, date: epoch });
export const chessStatsSchema = z.object({
  last: snapshot.optional(),
  best: snapshot.optional(),
  record: z
    .object({
      win: z.number().int().nonnegative(),
      loss: z.number().int().nonnegative(),
      draw: z.number().int().nonnegative(),
    })
    .optional(),
});
const statsSchema = z.object({
  chess_rapid: chessStatsSchema.optional(),
  chess_blitz: chessStatsSchema.optional(),
  chess_bullet: chessStatsSchema.optional(),
  chess_daily: chessStatsSchema.optional(),
});
const profileSchema = z.object({
  username: chessUsernameSchema,
  player_id: z.number().int().positive(),
});
const playerSchema = z.object({
  username: z.string(),
  rating,
  result: z.string().max(80),
});
const gameSchema = z.object({
  url: z.string().regex(/^https:\/\/www\.chess\.com\/game\/[a-z]+\/\d+$/),
  end_time: epoch,
  time_class: z.enum(CHESS_TIME_CLASS_VALUES),
  white: playerSchema,
  black: playerSchema,
});

export type ChessRatingStats = z.infer<typeof chessStatsSchema>;
export type ChessObservation = {
  externalKey: string;
  observedAt: string;
  value: number;
  timeClass: ChessTimeClass;
};
export type ChessProgress = {
  username: string;
  playerId: number;
  stats: Partial<Record<ChessTimeClass, ChessRatingStats>>;
  observations: ChessObservation[];
  months: string[];
};
type Options = {
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  userAgent?: string;
};

// The first import covers twelve calendar months, including the current month.
// Repeated imports replace this same window atomically, reflecting corrected games.
export async function fetchChessComProgress(
  usernameInput: string,
  options: Options = {},
): Promise<ChessProgress> {
  const parsedUsername = chessUsernameSchema.safeParse(usernameInput);
  if (!parsedUsername.success)
    throw new ChessComApiError(
      "Informe um nome de usuário válido do Chess.com.",
    );
  const username = parsedUsername.data;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const overallSignal = AbortSignal.timeout(90000);

  async function request<T>(suffix: string, schema: z.ZodType<T>): Promise<T> {
    try {
      const response = await fetchImpl(
        `https://api.chess.com/pub/player/${username}${suffix}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent":
              options.userAgent ??
              process.env.CHESS_COM_USER_AGENT ??
              "Planner/0.1 (https://github.com/C-J8/planejador-semanal)",
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([
            overallSignal,
            AbortSignal.timeout(options.timeoutMs ?? 10000),
          ]),
        },
      );
      if (response.status === 404)
        throw new ChessComApiError(
          "Usuário ou histórico não encontrado no Chess.com. Confira o nome informado.",
        );
      if (response.status === 429)
        throw new ChessComApiError(
          "O Chess.com limitou as consultas. Aguarde alguns minutos antes de tentar novamente.",
        );
      if (!response.ok)
        throw new ChessComApiError(
          "O Chess.com está indisponível no momento. Tente novamente mais tarde.",
        );
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success)
        throw new ChessComApiError(
          "O Chess.com retornou dados inesperados. O histórico anterior foi preservado.",
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof ChessComApiError) throw error;
      throw new ChessComApiError(
        "Não foi possível consultar o Chess.com. Verifique a conexão e tente novamente.",
      );
    }
  }

  const profile = await request("", profileSchema);
  if (profile.username !== username)
    throw new ChessComApiError(
      "O nome de usuário mudou. Informe o nome atual da conta.",
    );
  const stats = await request("/stats", statsSchema);
  const archive = await request(
    "/games/archives",
    z.object({ archives: z.array(z.string()).max(1000) }),
  );
  const firstMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  )
    .toISOString()
    .slice(0, 7)
    .replace("-", "/");
  const lastMonth = now.toISOString().slice(0, 7).replace("-", "/");
  const prefix = `https://api.chess.com/pub/player/${username}/games/`;
  const months = [
    ...new Set(
      archive.archives.map((url) => {
        // Never fetch a URL supplied by the upstream response directly.
        const month = url.startsWith(prefix) ? url.slice(prefix.length) : "";
        if (!/^\d{4}\/(0[1-9]|1[0-2])$/.test(month))
          throw new ChessComApiError(
            "Lista de arquivos inválida no Chess.com.",
          );
        return month;
      }),
    ),
  ]
    .filter((month) => month >= firstMonth && month <= lastMonth)
    .sort();
  const observations = new Map<string, ChessObservation>();
  for (const month of months) {
    const data = await request(
      `/games/${month}`,
      z.object({ games: z.array(z.unknown()).max(50000) }),
    );
    for (const raw of data.games) {
      const eligibility = z
        .object({
          rated: z.boolean().optional(),
          rules: z.string(),
          time_class: z.string(),
        })
        .safeParse(raw);
      if (!eligibility.success)
        throw new ChessComApiError(
          "Partida inválida no histórico do Chess.com.",
        );
      if (
        !eligibility.data.rated ||
        eligibility.data.rules !== "chess" ||
        !CHESS_TIME_CLASS_VALUES.includes(
          eligibility.data.time_class as ChessTimeClass,
        )
      )
        continue;
      const game = gameSchema.safeParse(raw);
      if (!game.success)
        throw new ChessComApiError(
          "Partida inválida no histórico do Chess.com. Tente novamente mais tarde.",
        );
      const own = [game.data.white, game.data.black].find(
        (player) => player.username.toLowerCase() === username,
      );
      if (!own)
        throw new ChessComApiError(
          "O histórico retornado não corresponde à conta informada.",
        );
      if (game.data.end_time * 1000 > now.getTime()) continue;
      observations.set(game.data.url, {
        externalKey: game.data.url,
        observedAt: new Date(game.data.end_time * 1000).toISOString(),
        value: own.rating,
        timeClass: game.data.time_class,
      });
    }
  }
  return {
    username: profile.username,
    playerId: profile.player_id,
    stats: Object.fromEntries(
      CHESS_TIME_CLASS_VALUES.flatMap((key) =>
        stats[`chess_${key}`] ? [[key, stats[`chess_${key}`]]] : [],
      ),
    ),
    observations: [...observations.values()].sort(
      (a, b) =>
        a.observedAt.localeCompare(b.observedAt) ||
        a.externalKey.localeCompare(b.externalKey),
    ),
    months,
  };
}
