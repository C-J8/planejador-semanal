"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  syncChessAction,
  type ChessSyncState,
} from "@/app/acompanhamento/xadrez/actions";
import { waitForChessSync } from "@/modules/chess/lib/sync-request";

export function ChessSyncForm({ username }: { username?: string }) {
  const [state, setState] = useState<ChessSyncState>({});
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const formData = new FormData(event.currentTarget);
    submitting.current = true;
    setPending(true);
    setState({});
    try {
      const result = await waitForChessSync(syncChessAction({}, formData));
      setState(result);
      // Reload only after persistence succeeds. A full navigation avoids a stuck
      // RSC refresh and preserves the current mode/range in the URL.
      if (result.ok) window.location.reload();
    } catch (error) {
      setState({
        ok: false,
        message:
          error instanceof Error && error.name === "ChessSyncTimeoutError"
            ? error.message
            : "Não foi possível receber a confirmação. Confira a conexão e tente novamente.",
      });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="chess-sync-form" aria-busy={pending}>
      <div className="form-field">
        <label htmlFor="chess-username">Usuário do Chess.com</label>
        <input
          id="chess-username"
          name="username"
          defaultValue={username ?? ""}
          placeholder="Seu nome de usuário"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={2}
          maxLength={50}
          pattern="[a-zA-Z0-9_\-]+"
          readOnly={Boolean(username)}
        />
      </div>
      <button className="button primary" disabled={pending} type="submit">
        {pending
          ? "Consultando partidas…"
          : username
            ? "Atualizar agora"
            : "Conectar e importar"}
      </button>
      {state.message && (
        <p
          className={state.ok ? "notice" : "form-error"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      {pending && (
        <p role="status">
          Consultando o Chess.com e salvando as partidas. Isso pode levar até
          dois minutos.
        </p>
      )}
    </form>
  );
}
