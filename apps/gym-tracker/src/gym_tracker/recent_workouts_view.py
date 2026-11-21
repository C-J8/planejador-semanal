from collections.abc import Callable

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from gym_tracker.services.recent_workouts import (
    recent_group_workouts,
    recent_workout_insights,
    summarize_exercise_days,
)

SET_COLORS = ["#3B82F6", "#22C55E", "#EF4444", "#F59E0B", "#A78BFA", "#22D3EE", "#F472B6"]


def render_recent_workouts(data: pd.DataFrame, *, theme_figure: Callable[[go.Figure], go.Figure]) -> None:
    st.subheader("Últimos treinos")
    st.caption(
        "As cinco sessões mais recentes de cada grupo muscular, dentro dos filtros da barra lateral. "
        "Sessões no mesmo dia são contadas separadamente."
    )
    if data.empty:
        st.info("Nenhum treino disponível para os filtros atuais.")
        return

    group = st.selectbox("Músculo para comparar", sorted(data["grupo_muscular"].unique()), key="recent_group")
    recent = recent_group_workouts(data, group)
    timeline = (
        recent[["data", "treino_id", "treino_label", "treino_ordem"]].drop_duplicates().sort_values("treino_ordem")
    )
    dates = pd.DatetimeIndex(timeline["data"])
    summary = summarize_exercise_days(recent)
    if len(dates) < 5:
        st.info(f"Este grupo tem {len(dates)} de 5 treinos disponíveis nos filtros atuais.")

    daily = summary.groupby(["treino_ordem", "treino_id"], sort=True).agg(
        series=("series", "sum"),
        repeticoes=("repeticoes_totais", "sum"),
        exercicios=("exercicio", "size"),
    )
    latest = daily.iloc[-1]
    previous = daily.iloc[-2] if len(daily) > 1 else None
    cards = st.columns(4)
    with cards[0]:
        st.metric("Último treino", dates[-1].strftime("%d/%m/%Y"))
    for column, field, label in zip(
        cards[1:],
        ["series", "repeticoes", "exercicios"],
        ["Séries no último treino", "Repetições no último treino", "Exercícios no último treino"],
        strict=True,
    ):
        with column:
            delta = f"{int(latest[field] - previous[field]):+d} vs. anterior" if previous is not None else None
            st.metric(label, str(int(latest[field])), delta=delta, delta_color="off")

    st.markdown("#### Comparação por exercício")
    variants = recent[["variante_id", "exercicio", "tipo", "exercicio_tipo"]].drop_duplicates().set_index("variante_id")
    variant_id = st.selectbox(
        "Exercício e aparelho",
        list(variants.index),
        format_func=lambda value: variants.loc[value, "exercicio_tipo"],
        key=f"recent_exercise_{group}",
    )
    exercise, equipment = variants.loc[variant_id, ["exercicio", "tipo"]]
    bodyweight = equipment == "Peso corporal"
    metrics = {
        "peso_kg": "Carga adicional (kg)" if bodyweight else "Carga (kg)",
        "repeticoes": "Repetições",
        "volume": "Volume de carga adicional por série (kg × rep)" if bodyweight else "Volume por série (kg × rep)",
    }
    metric = st.selectbox(
        "Métrica do gráfico",
        list(metrics),
        index=1 if bodyweight else 0,
        format_func=metrics.get,
        key=f"recent_metric_{group}_{bodyweight}",
    )
    focused = recent.loc[recent["variante_id"].eq(variant_id)]
    fig = go.Figure()
    load_label = "Carga adicional" if bodyweight else "Carga"
    for set_number, set_data in focused.groupby("serie", sort=True):
        points = timeline.merge(
            set_data.drop(columns=["data", "treino_label", "treino_ordem"]),
            on="treino_id",
            how="left",
            validate="one_to_one",
        )
        hover_values = points[["peso_kg", "repeticoes", "volume"]].astype(object)
        hover_values = hover_values.where(hover_values.notna(), None)
        fig.add_trace(
            go.Scatter(
                x=points["treino_label"].tolist(),
                y=[None if pd.isna(value) else float(value) for value in points[metric]],
                name=f"{int(set_number)}ª série",
                mode="lines+markers",
                line={"color": SET_COLORS[(int(set_number) - 1) % len(SET_COLORS)], "width": 3},
                marker={"size": 10},
                connectgaps=False,
                customdata=hover_values.values.tolist(),
                hovertemplate=(
                    "<b>%{fullData.name}</b> · %{x}<br>"
                    + load_label
                    + ": %{customdata[0]} kg<br>Repetições: %{customdata[1]}<br>"
                    "Volume da série: %{customdata[2]} kg × rep<extra></extra>"
                ),
            )
        )
    theme_figure(fig)
    fig.update_xaxes(type="category", categoryorder="array", categoryarray=timeline["treino_label"].tolist())
    if metric == "repeticoes":
        fig.update_yaxes(tickformat="d")
    fig.update_layout(
        title=f"{exercise} · {equipment}",
        xaxis_title="Treino",
        yaxis_title=metrics[metric],
        yaxis_rangemode="tozero",
    )
    st.plotly_chart(fig, width="stretch", key="recent_chart")
    st.caption(
        "Cada linha acompanha a mesma série nos treinos. Lacunas indicam séries sem registro. "
        "PC = peso corporal; + kg indica carga adicional."
    )

    with st.container(border=True, key="recent_insights"):
        st.markdown("#### Insights do último treino")
        if len(dates) > 1:
            st.caption(
                f"Comparação de {dates[-1]:%d/%m/%Y} com {dates[-2]:%d/%m/%Y}, sempre no mesmo exercício e aparelho."
            )
        st.caption("Nos insights, a melhor série é a de maior carga; no empate, a de mais repetições.")
        for insight in recent_workout_insights(summary):
            st.markdown(f"- {insight}")
