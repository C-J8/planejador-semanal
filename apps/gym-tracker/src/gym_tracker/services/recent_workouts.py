import math

import pandas as pd

EXERCISE_KEYS = ["exercicio", "tipo"]
DAY_KEYS = ["data", *EXERCISE_KEYS]


def recent_group_workouts(data: pd.DataFrame, group: str, limit: int = 5) -> pd.DataFrame:
    """Select the group's dates before focusing on a particular exercise."""
    if limit < 1:
        raise ValueError("O limite de treinos deve ser positivo.")
    group_data = data.loc[data["grupo_muscular"].eq(group)]
    dates = group_data["data"].drop_duplicates().sort_values().tail(limit)
    return group_data.loc[group_data["data"].isin(dates)].sort_values(["data", "exercicio", "tipo", "serie"]).copy()


def summarize_exercise_days(data: pd.DataFrame) -> pd.DataFrame:
    """Keep load and reps from the same top set, plus the day's totals."""
    top_sets = (
        data.sort_values(["peso_kg", "repeticoes", "serie"], ascending=[False, False, True], kind="stable")
        .drop_duplicates(DAY_KEYS)[[*DAY_KEYS, "peso_kg", "repeticoes"]]
        .rename(columns={"repeticoes": "repeticoes_melhor_serie"})
    )
    totals = data.groupby(DAY_KEYS, as_index=False).agg(
        series=("serie", "size"),
        repeticoes_totais=("repeticoes", "sum"),
        volume=("volume", "sum"),
    )
    return top_sets.merge(totals, on=DAY_KEYS, validate="one_to_one").sort_values(DAY_KEYS)


def format_load(value: float) -> str:
    return f"{float(value):g}".replace(".", ",")


def format_set(weight: float, reps: int, equipment: str) -> str:
    if equipment == "Peso corporal":
        load = "PC" if weight == 0 else f"PC + {format_load(weight)} kg"
    else:
        load = f"{format_load(weight)} kg"
    return f"{load} × {int(reps)}"


def recent_workout_insights(summary: pd.DataFrame) -> list[str]:
    """Describe the last two group dates without interpreting volume as strength."""
    dates = summary["data"].drop_duplicates().sort_values()
    if len(dates) < 2:
        return ["Há apenas um treino disponível deste grupo. A comparação aparecerá com o próximo registro."]
    previous_date, latest_date = dates.iloc[-2:]
    previous = summary.loc[summary["data"].eq(previous_date)].set_index(EXERCISE_KEYS)
    latest = summary.loc[summary["data"].eq(latest_date)].set_index(EXERCISE_KEYS)
    insights = []
    for exercise, equipment in sorted(previous.index.union(latest.index)):
        key = (exercise, equipment)
        label = f"{exercise} · {equipment}"
        if key not in latest.index:
            insights.append(f"{label}: sem registro no último treino ({latest_date:%d/%m/%Y}).")
            continue
        if key not in previous.index:
            insights.append(
                f"{label}: registrado no último treino; sem registro no anterior ({previous_date:%d/%m/%Y})."
            )
            continue
        before, after = previous.loc[key], latest.loc[key]
        old_reps, new_reps = int(before["repeticoes_melhor_serie"]), int(after["repeticoes_melhor_serie"])
        if math.isclose(before["peso_kg"], after["peso_kg"], abs_tol=1e-9):
            load = (
                "sem carga adicional"
                if equipment == "Peso corporal" and after["peso_kg"] == 0
                else f"com a mesma carga{' adicional' if equipment == 'Peso corporal' else ''} de "
                f"{format_load(after['peso_kg'])} kg"
            )
            if new_reps != old_reps:
                direction = "mais" if new_reps > old_reps else "menos"
                difference = abs(new_reps - old_reps)
                unit = "repetição" if difference == 1 else "repetições"
                message = f"{difference} {unit} a {direction} na melhor série ({old_reps} → {new_reps}), {load}."
            else:
                message = f"melhor série mantida em {format_set(after['peso_kg'], new_reps, equipment)}."
        else:
            message = (
                "melhor série passou de "
                f"{format_set(before['peso_kg'], old_reps, equipment)} para "
                f"{format_set(after['peso_kg'], new_reps, equipment)}."
            )
        if before["series"] != after["series"]:
            message += f" Séries: {int(before['series'])} → {int(after['series'])}."
        elif before["repeticoes_totais"] != after["repeticoes_totais"]:
            message += (
                f" Repetições totais: {int(before['repeticoes_totais'])} → {int(after['repeticoes_totais'])}, "
                f"mantendo {int(after['series'])} séries."
            )
        insights.append(f"{label}: {message}")
    return insights
