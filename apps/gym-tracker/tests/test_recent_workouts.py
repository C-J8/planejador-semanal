import json

import pandas as pd
import pytest
from streamlit.testing.v1 import AppTest

from gym_tracker.services.metrics import prepare_dashboard_dataframe
from gym_tracker.services.recent_workouts import (
    recent_group_workouts,
    recent_workout_insights,
    summarize_exercise_days,
)


def workout(date, group, exercise, equipment, *sets):
    return [
        {
            "data": date,
            "grupo_muscular": group,
            "exercicio": exercise,
            "tipo": equipment,
            "peso_kg": load,
            "repeticoes": reps,
            "serie": number,
        }
        for number, (load, reps) in enumerate(sets, start=1)
    ]


@pytest.fixture
def recent_data():
    rows = []
    for day in range(1, 7):
        sets = [(30, 10), (30, 8), (25, 6)] if day != 5 else [(30, 10), (30, 8)]
        rows += workout(f"2026-01-{day:02d}", "Peito", "Crucifixo", "Máquina", *sets)
    for day in (1, 3, 6):
        rows += workout(f"2026-01-{day:02d}", "Peito", "Supino inclinado", "Máquina com anilha", (40, 6))
    rows += workout("2026-01-06", "Peito", "Supino inclinado", "Halter", (20, 10))
    for day in range(7, 14):
        rows += workout(f"2026-01-{day:02d}", "Costas", "Remada", "Cabo", (40, 10))
    rows += workout("2026-01-04", "Abdômen", "Abdominal infra", "Peso corporal", (0, 10), (0, 8))
    rows += workout("2026-01-06", "Abdômen", "Abdominal infra", "Peso corporal", (0, 12), (0, 10))
    return prepare_dashboard_dataframe(pd.DataFrame(rows))


def test_last_five_dates_belong_to_each_muscle_and_do_not_backfill_missing_exercises(recent_data):
    original = recent_data.copy(deep=True)
    chest = recent_group_workouts(recent_data, "Peito")
    back = recent_group_workouts(recent_data, "Costas")
    assert chest["data"].dt.day.unique().tolist() == [2, 3, 4, 5, 6]
    assert back["data"].dt.day.unique().tolist() == [9, 10, 11, 12, 13]
    assert chest.loc[chest["exercicio"].eq("Supino inclinado"), "data"].dt.day.unique().tolist() == [3, 6]
    pd.testing.assert_frame_equal(recent_data, original)


def test_summary_keeps_equipment_separate(recent_data):
    recent = recent_group_workouts(recent_data, "Peito")
    summary = summarize_exercise_days(recent)
    supino = summary.loc[summary["exercicio"].eq("Supino inclinado")]
    machine = supino.loc[supino["tipo"].eq("Máquina com anilha")]
    dumbbell = supino.loc[supino["tipo"].eq("Halter")]
    assert machine["data"].dt.day.tolist() == [3, 6]
    assert machine["peso_kg"].tolist() == [40, 40]
    assert dumbbell["data"].dt.day.tolist() == [6]
    assert dumbbell["peso_kg"].tolist() == [20]


def test_top_set_load_and_reps_come_from_the_same_actual_set():
    rows = workout("2026-01-01", "Peito", "Supino", "Máquina", (30, 15), (40, 6), (40, 7))
    data = prepare_dashboard_dataframe(pd.DataFrame(rows))
    summary = summarize_exercise_days(data).iloc[0]
    assert summary["peso_kg"] == 40
    assert summary["repeticoes_melhor_serie"] == 7
    assert summary["repeticoes_totais"] == 28
    assert summary["series"] == 3
    assert summary["volume"] == 970


@pytest.mark.parametrize(
    ("previous", "latest", "expected"),
    [
        ((40, 6), (40, 7), "1 repetição a mais na melhor série (6 → 7), com a mesma carga de 40 kg"),
        ((40, 8), (40, 6), "2 repetições a menos na melhor série (8 → 6), com a mesma carga de 40 kg"),
        ((40, 8), (45, 6), "melhor série passou de 40 kg × 8 para 45 kg × 6"),
        ((40, 8), (40, 8), "melhor série mantida em 40 kg × 8"),
    ],
)
def test_insights_describe_observed_changes(previous, latest, expected):
    rows = workout("2026-01-01", "Peito", "Supino", "Máquina", previous)
    rows += workout("2026-01-02", "Peito", "Supino", "Máquina", latest)
    data = prepare_dashboard_dataframe(pd.DataFrame(rows))
    assert expected in recent_workout_insights(summarize_exercise_days(data))[0]


def test_insights_compare_adjacent_group_dates_instead_of_older_exercise_dates(recent_data):
    summary = summarize_exercise_days(recent_group_workouts(recent_data, "Peito"))
    insights = recent_workout_insights(summary)
    machine = next(item for item in insights if item.startswith("Supino inclinado · Máquina com anilha"))
    assert "sem registro no anterior (05/01/2026)" in machine
    removed = summary.loc[~(summary["data"].eq(pd.Timestamp("2026-01-06")) & summary["exercicio"].eq("Crucifixo"))]
    assert any(
        "Crucifixo · Máquina · total: sem registro no último treino (06/01/2026)" in item
        for item in recent_workout_insights(removed)
    )


def test_bodyweight_insights_use_reps_without_inventing_strength_or_body_mass(recent_data):
    summary = summarize_exercise_days(recent_group_workouts(recent_data, "Abdômen"))
    insight = recent_workout_insights(summary)[0]
    assert "2 repetições a mais" in insight
    assert "sem carga adicional" in insight
    assert "Repetições totais: 18 → 22, mantendo 2 séries" in insight


def test_single_workout_and_empty_selection(recent_data):
    one = recent_group_workouts(recent_data, "Peito", limit=1)
    assert "apenas um treino" in recent_workout_insights(summarize_exercise_days(one))[0]
    empty = recent_group_workouts(recent_data, "Inexistente")
    assert empty.empty


def test_recent_view_switches_muscles_and_bodyweight_metrics(recent_data):
    app = AppTest.from_string(
        "import streamlit as st\n"
        "from gym_tracker.recent_workouts_view import render_recent_workouts\n"
        "render_recent_workouts(st.session_state['test_data'], theme_figure=lambda fig: fig)\n"
    )
    app.session_state["test_data"] = recent_data
    app.run(timeout=30)
    assert not app.exception
    assert app.selectbox(key="recent_metric_Abdômen_True").value == "repeticoes"
    assert any("2 de 5" in message.value for message in app.info)
    bodyweight_chart = json.loads(app.get("plotly_chart")[0].proto.spec)
    assert [trace["y"] for trace in bodyweight_chart["data"]] == [[10, 12], [8, 10]]
    app.selectbox(key="recent_metric_Abdômen_True").set_value("peso_kg").run()
    assert not app.exception
    bodyweight_chart = json.loads(app.get("plotly_chart")[0].proto.spec)
    assert all(trace["y"] == [0, 0] for trace in bodyweight_chart["data"])
    app.selectbox(key="recent_group").set_value("Peito").run()
    assert not app.exception
    chart = json.loads(app.get("plotly_chart")[0].proto.spec)
    assert [trace["name"] for trace in chart["data"]] == ["1ª série", "2ª série", "3ª série"]
    assert [trace["line"]["color"] for trace in chart["data"]] == ["#3B82F6", "#22C55E", "#EF4444"]
    assert [trace["y"] for trace in chart["data"]] == [[30] * 5, [30] * 5, [25, 25, 25, None, 25]]
    app.selectbox(key="recent_metric_Peito_False").set_value("repeticoes").run()
    assert not app.exception
    chart = json.loads(app.get("plotly_chart")[0].proto.spec)
    assert [trace["y"] for trace in chart["data"]] == [[10] * 5, [8] * 5, [6, 6, 6, None, 6]]
    app.selectbox(key="recent_metric_Peito_False").set_value("volume").run()
    assert not app.exception
    chart = json.loads(app.get("plotly_chart")[0].proto.spec)
    assert [trace["y"] for trace in chart["data"]] == [[300] * 5, [240] * 5, [150, 150, 150, None, 150]]
    app.selectbox(key="recent_exercise_Peito").set_value("Supino inclinado|Máquina com anilha|total|").run()
    assert not app.exception
    chart = json.loads(app.get("plotly_chart")[0].proto.spec)
    assert chart["data"][0]["x"] == [f"{day:02d}/01/2026" for day in range(2, 7)]
    assert chart["data"][0]["y"] == [None, 240, None, None, 240]
    assert chart["data"][0]["connectgaps"] is False
    assert any("Insights do último treino" in message.value for message in app.markdown)


def test_dashboard_includes_recent_workouts_tab(monkeypatch, recent_data):
    monkeypatch.setattr("gym_tracker.data_adapter.load_dashboard_data", lambda: recent_data)
    monkeypatch.setattr("gym_tracker.data_adapter.data_signature", lambda: "recent-workouts-ui")
    app = AppTest.from_file("app.py").run(timeout=30)
    assert not app.exception
    assert "Últimos treinos" in [tab.label for tab in app.tabs]

    def bar_colors():
        charts = [json.loads(element.proto.spec) for element in app.get("plotly_chart")]
        return [
            {trace["name"]: trace["marker"]["color"] for trace in chart["data"]}
            for chart in charts
            if chart["data"][0]["type"] == "bar"
        ]

    colors = bar_colors()
    assert len(colors) == 2
    assert all(chart_colors == colors[0] for chart_colors in colors)
    assert len(set(colors[0].values())) == recent_data["grupo_muscular"].nunique()
    app.selectbox(key="recent_group").set_value("Peito").run()
    assert not app.exception
    assert len(app.dataframe) > 1
    app.sidebar.selectbox[0].set_value("Peito").run()
    assert not app.exception
    assert all(chart_colors == {"Peito": colors[0]["Peito"]} for chart_colors in bar_colors())
