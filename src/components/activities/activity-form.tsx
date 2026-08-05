"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActivityFormState } from "@/lib/activity-form";

type FormAction = (
  state: ActivityFormState,
  formData: FormData,
) => Promise<ActivityFormState>;

type ActivityFormProps = {
  action: FormAction;
  initialValues?: Partial<
    Record<
      | "name"
      | "color"
      | "icon"
      | "defaultDurationMinutes"
      | "defaultStartTime"
      | "description",
      string
    >
  >;
  submitLabel: string;
  returnTo?: string;
};

const initialState: ActivityFormState = {};

export function ActivityForm({
  action,
  initialValues = {},
  submitLabel,
  returnTo = "/atividades",
}: ActivityFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = { ...initialValues, ...state.values };

  const error = (field: keyof NonNullable<ActivityFormState["fields"]>) =>
    state.fields?.[field]?.[0];

  return (
    <form action={formAction} className="activity-form" noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="form-field">
        <label htmlFor="name">Nome</label>
        <input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={values.name}
          aria-invalid={Boolean(error("name"))}
          aria-describedby="name-error"
        />
        <FieldError id="name-error" message={error("name")} />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="color">Cor</label>
          <div className="color-fields">
            <input
              id="color-picker"
              aria-label="Selecionar cor"
              type="color"
              defaultValue={values.color ?? "#3B82F6"}
              onInput={(event) => {
                const textInput =
                  document.querySelector<HTMLInputElement>("#color");
                if (textInput)
                  textInput.value = event.currentTarget.value.toUpperCase();
              }}
            />
            <input
              id="color"
              name="color"
              required
              maxLength={7}
              defaultValue={values.color ?? "#3B82F6"}
              aria-invalid={Boolean(error("color"))}
              aria-describedby="color-error"
            />
          </div>
          <FieldError id="color-error" message={error("color")} />
        </div>

        <div className="form-field">
          <label htmlFor="icon">Ícone</label>
          <input
            id="icon"
            name="icon"
            maxLength={32}
            placeholder="Ex.: 📚"
            defaultValue={values.icon ?? ""}
            aria-invalid={Boolean(error("icon"))}
            aria-describedby="icon-error"
          />
          <FieldError id="icon-error" message={error("icon")} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="defaultDurationMinutes">Duração padrão (HH:MM)</label>
          <input
            id="defaultDurationMinutes"
            name="defaultDurationMinutes"
            type="text"
            inputMode="numeric"
            placeholder="Ex.: 04:00"
            pattern="[0-9]{1,3}:[0-5][0-9]"
            defaultValue={values.defaultDurationMinutes ?? ""}
            aria-invalid={Boolean(error("defaultDurationMinutes"))}
            aria-describedby="duration-error"
          />
          <small>Opcional. Use horas e minutos, por exemplo 04:00.</small>
          <FieldError
            id="duration-error"
            message={error("defaultDurationMinutes")}
          />
        </div>

        <div className="form-field">
          <label htmlFor="defaultStartTime">Horário padrão</label>
          <input
            id="defaultStartTime"
            name="defaultStartTime"
            type="time"
            defaultValue={values.defaultStartTime ?? ""}
            aria-invalid={Boolean(error("defaultStartTime"))}
            aria-describedby="time-error"
          />
          <FieldError id="time-error" message={error("defaultStartTime")} />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="description">Descrição</label>
        <textarea
          id="description"
          name="description"
          maxLength={2000}
          rows={5}
          defaultValue={values.description ?? ""}
          aria-invalid={Boolean(error("description"))}
          aria-describedby="description-error"
        />
        <FieldError id="description-error" message={error("description")} />
      </div>

      {state.message && (
        <p className="form-message error-message" role="alert">
          {state.message}
        </p>
      )}

      <div className="form-actions">
        <button className="button primary" disabled={pending} type="submit">
          {pending ? "Salvando..." : submitLabel}
        </button>
        <Link className="button secondary" href={returnTo}>
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
