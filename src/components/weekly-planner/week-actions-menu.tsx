"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function WeekActionsMenu({
  weekStart,
  today,
}: {
  weekStart: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="week-actions-menu" ref={root}>
      <button
        type="button"
        className="button secondary"
        aria-expanded={open}
        aria-controls="week-more-actions"
        onClick={() => setOpen((value) => !value)}
      >
        Mais ações
      </button>
      {open && (
        <div className="week-actions-popover" id="week-more-actions">
          <Link
            onClick={() => setOpen(false)}
            href={`/semana/recursos?mode=save-template&week=${weekStart}`}
          >
            Salvar como modelo
          </Link>
          <Link
            onClick={() => setOpen(false)}
            href={`/semana/recursos?mode=apply-template&target=${weekStart}`}
          >
            Aplicar modelo
          </Link>
          <Link
            onClick={() => setOpen(false)}
            href={`/semana/recursos?mode=recurrence&start=${today}`}
          >
            Criar repetição
          </Link>
          <Link onClick={() => setOpen(false)} href="/modelos">
            Gerenciar modelos
          </Link>
          <Link onClick={() => setOpen(false)} href="/repeticoes">
            Gerenciar repetições
          </Link>
        </div>
      )}
    </div>
  );
}
