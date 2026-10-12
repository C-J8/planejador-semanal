"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  statusSnapshotSchema,
  type StatusSnapshot,
} from "../lib/status-values";

export function StatusDashboard({
  initial,
  showAcademia,
}: {
  initial: StatusSnapshot;
  showAcademia: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (currentRequest.current) return;
    const controller = new AbortController();
    currentRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setBusy(true);
    try {
      const response = await fetch("/api/status", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Status unavailable");
      const parsed = statusSnapshotSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Invalid status response");
      if (mounted.current) {
        setSnapshot(parsed.data);
        setFailed(false);
      }
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      window.clearTimeout(timeout);
      if (currentRequest.current === controller) currentRequest.current = null;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      currentRequest.current?.abort();
    };
  }, [refresh]);

  const dateTime = (at: string | null) =>
    at
      ? new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }).format(new Date(at))
      : "Sem registro disponível";

  return (
    <section className="system-status" aria-labelledby="system-status-title">
      <div className="status-page-heading">
        <div>
          <h1 id="system-status-title">Status do sistema</h1>
          <p>Planner, Chess e Academia em um só lugar.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "Consultando…" : "Atualizar status"}
        </button>
      </div>
      <div className="status-update-info" role="status" aria-live="polite">
        {busy
          ? "Consultando os serviços…"
          : `Última consulta: ${dateTime(snapshot.checkedAt)}`}
        <span>
          Atualização automática a cada 30 segundos enquanto esta página estiver
          visível.
        </span>
      </div>
      {failed && (
        <p className="status-alert" role="alert">
          Não foi possível atualizar o status. Os resultados abaixo são
          anteriores e não confirmam o estado atual. A próxima consulta tentará
          novamente.
        </p>
      )}
      <div className="status-grid" aria-busy={busy}>
        {snapshot.cards.map((card) => (
          <article
            className={`status-card status-card--${card.level}`}
            key={card.id}
          >
            <div className="status-card-heading">
              <h2>{card.title}</h2>
              <span className="status-indicator" aria-hidden="true" />
            </div>
            <strong className="status-card-value">{card.label}</strong>
            <p>{card.detail}</p>
            {card.facts.length > 0 && (
              <dl>
                {card.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>
                      {fact.at ? (
                        <time dateTime={fact.at}>{dateTime(fact.at)}</time>
                      ) : (
                        "Sem registro disponível"
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        ))}
      </div>
      <div className="status-page-links">
        <Link className="button secondary" href="/acompanhamento/xadrez">
          Ver Xadrez
        </Link>
        {showAcademia && (
          <a
            className="button secondary"
            href="/academia"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir Academia
          </a>
        )}
      </div>
      <p className="status-footnote">
        Esta página é somente leitura. Não atualiza partidas, importa mensagens,
        aprova pendências ou cria backups. Horários em Brasília.
      </p>
    </section>
  );
}
