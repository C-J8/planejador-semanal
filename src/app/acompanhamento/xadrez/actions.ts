"use server";

import { z } from "zod";
import { ChessComApiError } from "@/modules/chess/integrations/chess-com";
import { syncChessProgress } from "@/modules/chess/services/chess-progress";

export type ChessSyncState = { ok?: boolean; message?: string };

export async function syncChessAction(
  _previous: ChessSyncState,
  formData: FormData,
): Promise<ChessSyncState> {
  try {
    const count = await syncChessProgress(
      String(formData.get("username") ?? ""),
    );
    return {
      ok: true,
      message: `Histórico atualizado: ${count} partidas avaliadas nos últimos 12 meses de calendário.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ChessComApiError
          ? error.message
          : error instanceof z.ZodError
            ? "Confira o nome de usuário informado."
            : "Não foi possível atualizar o histórico. Confira se o banco está em execução e tente novamente.",
    };
  }
}
