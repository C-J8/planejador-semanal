"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PlannerFormState } from "@/lib/planner-form";

type PlannerFormProps = {
  action: (
    state: PlannerFormState,
    formData: FormData,
  ) => Promise<PlannerFormState>;
  kind: "occurrence" | "event";
  initialValues: Record<string, string>;
  weekStart: string;
  submitLabel: string;
  returnTo?: string;
};

export function PlannerForm(props: PlannerFormProps) {
  const [state, action, pending] = useActionState(props.action, {});
  const values = { ...props.initialValues, ...state.values };
  const error = (field: string) => state.fields?.[field]?.[0];

  return (
    <form action={action} className="activity-form" noValidate>
      <input
        type="hidden"
        name="returnTo"
        value={props.returnTo ?? `/semana?week=${props.weekStart}`}
      />
      {props.kind === "event" && (
        <div className="form-field">
          <label htmlFor="title">Título</label>
          <input
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={values.title}
            aria-invalid={Boolean(error("title"))}
            aria-describedby="title-error"
          />
          <FieldError id="title-error" message={error("title")} />
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label
            htmlFor={props.kind === "event" ? "eventDate" : "scheduledDate"}
          >
            Data
          </label>
          <input
            id={props.kind === "event" ? "eventDate" : "scheduledDate"}
            name={props.kind === "event" ? "eventDate" : "scheduledDate"}
            type="date"
            required
            defaultValue={values.eventDate ?? values.scheduledDate}
            aria-invalid={Boolean(
              error(props.kind === "event" ? "eventDate" : "scheduledDate"),
            )}
            aria-describedby="date-error"
          />
          <FieldError
            id="date-error"
            message={error(
              props.kind === "event" ? "eventDate" : "scheduledDate",
            )}
          />
        </div>
        <div className="form-field">
          <label htmlFor="startTime">Horário</label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={values.startTime}
            aria-invalid={Boolean(error("startTime"))}
            aria-describedby="start-time-error"
          />
          <FieldError id="start-time-error" message={error("startTime")} />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="durationMinutes">Duração (minutos)</label>
        <input
          id="durationMinutes"
          name="durationMinutes"
          type="number"
          min={1}
          step={1}
          defaultValue={values.durationMinutes}
          aria-invalid={Boolean(error("durationMinutes"))}
          aria-describedby="duration-error"
        />
        <FieldError id="duration-error" message={error("durationMinutes")} />
      </div>

      <div className="form-field">
        <label htmlFor={props.kind === "event" ? "description" : "notes"}>
          {props.kind === "event" ? "Descrição" : "Observações"}
        </label>
        <textarea
          id={props.kind === "event" ? "description" : "notes"}
          name={props.kind === "event" ? "description" : "notes"}
          rows={5}
          maxLength={2000}
          defaultValue={values.description ?? values.notes}
          aria-invalid={Boolean(
            error(props.kind === "event" ? "description" : "notes"),
          )}
          aria-describedby="text-error"
        />
        <FieldError
          id="text-error"
          message={error(props.kind === "event" ? "description" : "notes")}
        />
      </div>

      {state.message && (
        <p className="form-message error-message" role="alert">
          {state.message}
        </p>
      )}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "Salvando..." : props.submitLabel}
        </button>
        <Link
          className="button secondary"
          href={props.returnTo ?? `/semana?week=${props.weekStart}`}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <span className="field-error" id={id}>
      {message}
    </span>
  );
}
