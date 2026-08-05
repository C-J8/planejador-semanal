"use client";

import { useState } from "react";
import {
  clearCurrentWeekAction,
  copyNextWeekAction,
} from "@/app/semana/recursos/actions";

export function WeekQuickActions({ weekStart }: { weekStart: string }) {
  const [copying, setCopying] = useState(false);
  const [clearing, setClearing] = useState(false);

  return (
    <div className="week-quick-actions">
      <form action={copyNextWeekAction} onSubmit={() => setCopying(true)}>
        <input type="hidden" name="week" value={weekStart} />
        <button
          className="button primary"
          type="submit"
          disabled={copying || clearing}
        >
          {copying ? "Copiando..." : "Copiar semana"}
        </button>
      </form>
      <form
        action={clearCurrentWeekAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Remover todas as atividades desta semana? Eventos e atividades da biblioteca serão preservados.",
            )
          ) {
            event.preventDefault();
            return;
          }
          setClearing(true);
        }}
      >
        <input type="hidden" name="week" value={weekStart} />
        <button
          className="button danger"
          type="submit"
          disabled={copying || clearing}
        >
          {clearing ? "Limpando..." : "Limpar semana"}
        </button>
      </form>
    </div>
  );
}
