"use client";

import { useActionState } from "react";
import {
  changeActivityStatusAction,
  type ActivityStatusState,
} from "@/app/atividades/actions";

export function ActivityStatusButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState<
    ActivityStatusState,
    FormData
  >(changeActivityStatusAction, {});

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          active &&
          !window.confirm(
            "Arquivar esta atividade? Você poderá reativá-la depois.",
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="hidden"
        name="operation"
        value={active ? "archive" : "reactivate"}
      />
      <button
        className="button secondary small"
        disabled={pending}
        type="submit"
      >
        {pending ? "Salvando..." : active ? "Arquivar" : "Reativar"}
      </button>
      {state.message && (
        <span className="inline-error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
