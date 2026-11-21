import pandas as pd
import plotly.express as px
import streamlit as st

from gym_tracker.data_adapter import DataBackendError, data_signature, load_dashboard_data
from gym_tracker.recent_workouts_view import render_recent_workouts

MUSCLE_COLORS = {
    "Peito": "#60A5FA",
    "Costas": "#FB923C",
    "Pernas": "#34D399",
    "Ombro": "#A78BFA",
    "Bíceps": "#F472B6",
    "Tríceps": "#F87171",
    "Antebraço": "#22D3EE",
    "Abdômen": "#FACC15",
}
PLOTLY_TEMPLATE = "plotly_dark"
GROUP_CHART_FEATURES = {
    "peso_kg": {"label": "Peso (kg)", "color": "#FF3D3D", "decimals": 1},
    "repeticoes_melhor_serie": {"label": "Reps melhor série", "color": "#FFB000", "decimals": 0},
    "series": {"label": "Séries", "color": "#39FF88", "decimals": 0},
    "repeticoes_totais": {"label": "Reps totais", "color": "#FF3D81", "decimals": 0},
    "volume": {"label": "Volume", "color": "#FF7A00", "decimals": 0},
}
st.set_page_config(
    page_title="Gym Tracker",
    page_icon="",
    layout="wide",
)

st.markdown(
    """
    <style>
    .stApp, [data-testid="stHeader"] {
        background: #17191F;
        color: #F1F3F5;
    }

    [data-testid="stSidebar"] {
        background: #272E3B;
        border-right: 1px solid #3B4453;
    }

    [data-testid="stMetric"] {
        background: #20252E;
        border: 1px solid #343B47;
        border-radius: 12px;
        padding: 14px 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    }

    [data-testid="stMetricValue"] {
        color: #F1F3F5;
    }

    [data-testid="stMetricLabel"] p {
        color: #AAB2C0;
    }

    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }

    .stTabs [data-baseweb="tab"] {
        border-radius: 10px;
        background: #20252E;
        color: #B0B8C5;
        border: 1px solid #343B47;
        padding: 8px 16px;
    }

    .stTabs [data-baseweb="tab"]:hover {
        background: #2B313D;
        color: #F1F3F5;
        border-color: #485160;
    }

    .stTabs [data-baseweb="tab"][aria-selected="true"] {
        background: #302529;
        color: #F1F3F5;
        border-color: #EF4444;
    }

    .stTabs [data-baseweb="tab-highlight"] {
        background: #EF4444;
    }

    .st-key-recent_insights {
        background: #20252E;
        border-radius: 12px;
    }

    div[data-testid="stDataFrame"] {
        border: 1px solid #343B47;
        border-radius: 12px;
        overflow: hidden;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data
def load_data(signature: str) -> pd.DataFrame:
    """Load recorded sets with volume and calendar fields for the dashboard."""
    return load_dashboard_data()


@st.fragment(run_every="60s")
def refresh_imported_data() -> None:
    """Poll only the revision; rerender charts when committed data changes."""
    signature = data_signature()
    previous = st.session_state.get("gym_data_signature")
    st.session_state["gym_data_signature"] = signature
    if previous is not None and previous != signature:
        st.rerun()


def format_number(value: float, decimals: int = 0) -> str:
    if pd.isna(value):
        return "-"
    return f"{value:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def metric_card(label: str, value: str, help_text: str | None = None) -> None:
    st.metric(label=label, value=value, help=help_text)


def filter_multiselect(label: str, options: list[str], default_all: bool = True) -> list[str]:
    default = options if default_all else []
    return st.sidebar.multiselect(label, options=options, default=default)


def select_all_or_one(label: str, options: list[str]) -> list[str]:
    choice = st.sidebar.selectbox(label, options=["Todos"] + options)
    return options if choice == "Todos" else [choice]


def theme_figure(fig):
    fig.update_layout(
        template=PLOTLY_TEMPLATE,
        colorway=list(MUSCLE_COLORS.values()),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"color": "#F1F3F5"},
        hoverlabel={"bgcolor": "#272E3B", "bordercolor": "#414B5B", "font_color": "#F1F3F5"},
        legend_title_text="",
        hovermode="x unified",
        margin={"l": 20, "r": 20, "t": 40, "b": 20},
    )
    fig.update_xaxes(gridcolor="rgba(170, 178, 192, 0.10)", zerolinecolor="rgba(170, 178, 192, 0.18)")
    fig.update_yaxes(gridcolor="rgba(170, 178, 192, 0.10)", zerolinecolor="rgba(170, 178, 192, 0.18)")
    return fig


def top_set_progress(data: pd.DataFrame) -> pd.DataFrame:
    return (
        data.sort_values(["peso_kg", "repeticoes"], ascending=[False, False], kind="stable")
        .drop_duplicates("treino_id")
        .sort_values("treino_ordem")
    )


def exercise_day_progress(data: pd.DataFrame) -> pd.DataFrame:
    keys = ["data", "treino_id", "treino_label", "treino_ordem"]
    top_sets = top_set_progress(data)[[*keys, "peso_kg", "repeticoes"]]
    top_sets = top_sets.rename(columns={"repeticoes": "repeticoes_melhor_serie"})
    totals = data.groupby(keys, as_index=False).agg(
        series=("serie", "count"), repeticoes_totais=("repeticoes", "sum"), volume=("volume", "sum")
    )
    return top_sets.merge(totals, on=keys, validate="one_to_one").sort_values("treino_ordem")


def feature_display(value: float, decimals: int) -> str:
    if decimals == 0:
        return format_number(int(round(value)))
    return format_number(value, decimals)


def build_feature_chart_data(progress: pd.DataFrame, selected_features: list[str], normalize: bool) -> pd.DataFrame:
    rows = []
    for feature in selected_features:
        config = GROUP_CHART_FEATURES[feature]
        series = progress[feature].astype(float)
        max_value = series.max()
        min_value = series.min()

        if normalize:
            if max_value == min_value:
                plot_values = pd.Series([100.0] * len(series), index=series.index)
            else:
                plot_values = ((series - min_value) / (max_value - min_value)) * 100
        else:
            plot_values = series

        for index, raw_value in series.items():
            rows.append(
                {
                    "data": progress.loc[index, "data"],
                    "treino_label": progress.loc[index, "treino_label"],
                    "feature": feature,
                    "metrica": config["label"],
                    "valor": raw_value,
                    "valor_plot": plot_values.loc[index],
                    "valor_formatado": feature_display(raw_value, config["decimals"]),
                }
            )

    return pd.DataFrame(rows)


refresh_imported_data()

try:
    df = load_data(data_signature())
except DataBackendError as error:
    st.error(str(error))
    st.stop()

st.title("Gym Tracker")
st.caption("Base importada do WhatsApp, com uma linha por série.")

all_groups = sorted(df["grupo_muscular"].unique())
muscle_colors = MUSCLE_COLORS.copy()
extra_colors = iter(color for color in px.colors.qualitative.Alphabet if color not in muscle_colors.values())
for group in all_groups:
    if group not in muscle_colors:
        muscle_colors[group] = next(extra_colors)

with st.sidebar:
    st.header("Filtros")

    min_date = df["data"].min().date()
    max_date = df["data"].max().date()
    date_range = st.date_input(
        "Período",
        value=(min_date, max_date),
        min_value=min_date,
        max_value=max_date,
    )

    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_date, end_date = date_range
    else:
        start_date, end_date = min_date, max_date

    groups = select_all_or_one("Grupo muscular", all_groups)

    available_after_group = df[df["grupo_muscular"].isin(groups)] if groups else df.iloc[0:0]
    exercises = filter_multiselect("Exercício", sorted(available_after_group["exercicio"].unique()))

    available_after_exercise = (
        available_after_group[available_after_group["exercicio"].isin(exercises)]
        if exercises
        else available_after_group.iloc[0:0]
    )
    types = filter_multiselect("Tipo", sorted(available_after_exercise["tipo"].unique()))

mask = (
    (df["data"].dt.date >= start_date)
    & (df["data"].dt.date <= end_date)
    & (df["grupo_muscular"].isin(groups))
    & (df["exercicio"].isin(exercises))
    & (df["tipo"].isin(types))
)
filtered = df.loc[mask].copy()

if filtered.empty:
    st.warning("Nenhum registro encontrado para os filtros atuais.")
    st.stop()

if filtered["tipo"].eq("Peso corporal").any():
    st.caption(
        "Em exercícios com peso corporal, carga e volume consideram apenas a carga adicional. "
        "As séries e repetições são contadas normalmente."
    )

days_count = filtered["data"].nunique()
series_count = len(filtered)
volume_total = filtered["volume"].sum()
reps_total = int(filtered["repeticoes"].sum())
best_load = filtered["peso_kg"].max()

kpi_cols = st.columns(4)
with kpi_cols[0]:
    metric_card("Dias registrados", str(days_count))
    st.caption(f"{filtered['treino_id'].nunique()} sessões de treino")
with kpi_cols[1]:
    metric_card("Séries", str(series_count))
with kpi_cols[2]:
    metric_card("Repetições", format_number(reps_total))
with kpi_cols[3]:
    metric_card("Maior carga", f"{format_number(best_load, 1)} kg")

tab_overview, tab_groups, tab_recent, tab_records, tab_data = st.tabs(
    ["Visão geral", "Grupos", "Últimos treinos", "Records", "Dados"]
)

with tab_overview:
    left, right = st.columns((1.2, 1))

    weekly_group = (
        filtered.groupby(["semana", "grupo_muscular"], as_index=False)
        .agg(series=("serie", "count"), repeticoes=("repeticoes", "sum"), volume=("volume", "sum"))
        .sort_values("semana")
    )

    with left:
        st.subheader("Séries semanais por grupo")
        fig = px.bar(
            weekly_group,
            x="semana",
            y="series",
            color="grupo_muscular",
            barmode="stack",
            color_discrete_map=muscle_colors,
            category_orders={"grupo_muscular": all_groups},
            labels={
                "semana": "Semana",
                "series": "Séries",
                "grupo_muscular": "Grupo",
            },
        )
        theme_figure(fig)
        st.plotly_chart(fig, width="stretch")

    group_summary = (
        filtered.groupby("grupo_muscular", as_index=False)
        .agg(
            volume=("volume", "sum"),
            series=("serie", "count"),
            repeticoes=("repeticoes", "sum"),
            treinos=("data", "nunique"),
            maior_carga=("peso_kg", "max"),
        )
        .sort_values("series", ascending=False)
    )

    with right:
        st.subheader("Séries por grupo")
        fig = px.bar(
            group_summary,
            x="series",
            y="grupo_muscular",
            color="grupo_muscular",
            orientation="h",
            color_discrete_map=muscle_colors,
            category_orders={"grupo_muscular": all_groups},
            labels={"series": "Séries", "grupo_muscular": "Grupo"},
        )
        theme_figure(fig)
        fig.update_layout(showlegend=False, yaxis={"categoryorder": "total ascending"})
        st.plotly_chart(fig, width="stretch")

    st.subheader("Resumo por grupo")
    st.dataframe(
        group_summary.rename(
            columns={
                "grupo_muscular": "Grupo",
                "series": "Séries",
                "repeticoes": "Repetições",
                "treinos": "Dias",
                "maior_carga": "Maior carga",
                "volume": "Volume",
            }
        ),
        width="stretch",
        hide_index=True,
    )

with tab_groups:
    st.subheader("Painéis por grupo muscular")
    st.caption(
        "Escolha exercícios dentro de cada grupo para ver a evolução sem misturar movimentos de grupos diferentes."
    )

    group_names = sorted(filtered["grupo_muscular"].unique())
    group_tabs = st.tabs(group_names)

    for group_name, group_tab in zip(group_names, group_tabs, strict=True):
        with group_tab:
            group_data = filtered[filtered["grupo_muscular"] == group_name].copy()
            group_exercises = sorted(group_data["exercicio"].unique())
            selected_group_exercises = st.multiselect(
                "Exercícios do grupo",
                options=group_exercises,
                default=group_exercises,
                key=f"group_exercises_{group_name}",
            )
            group_view = group_data[group_data["exercicio"].isin(selected_group_exercises)].copy()

            if group_view.empty:
                st.info("Selecione pelo menos um exercício para ver este painel.")
                continue

            gcols = st.columns(4)
            with gcols[0]:
                metric_card("Volume do grupo", f"{format_number(group_view['volume'].sum())} kgxrep")
            with gcols[1]:
                metric_card("Exercícios", str(group_view["exercicio"].nunique()))
            with gcols[2]:
                metric_card("Séries", str(len(group_view)))
            with gcols[3]:
                metric_card("Melhor carga", f"{format_number(group_view['peso_kg'].max(), 1)} kg")

            exercise_options = sorted(group_view["exercicio_tipo"].unique())
            focused_exercise = st.selectbox(
                "Exercício para evolução",
                options=exercise_options,
                key=f"focused_exercise_{group_name}",
            )
            focus_view = group_view[group_view["exercicio_tipo"] == focused_exercise]
            progress = exercise_day_progress(focus_view)

            chart_left, chart_right = st.columns((1.4, 1))
            with chart_left:
                selected_features = st.multiselect(
                    "Métricas no gráfico",
                    options=list(GROUP_CHART_FEATURES.keys()),
                    default=["peso_kg", "repeticoes_melhor_serie", "series"],
                    format_func=lambda key: GROUP_CHART_FEATURES[key]["label"],
                    key=f"group_chart_features_{group_name}",
                )
            with chart_right:
                scale_mode = st.radio(
                    "Escala",
                    options=["Valores reais", "Normalizado 0-100"],
                    horizontal=True,
                    key=f"group_chart_scale_{group_name}",
                )

            if not selected_features:
                st.info("Escolha pelo menos uma métrica para desenhar o gráfico.")
            else:
                normalize_chart = scale_mode == "Normalizado 0-100"
                chart_data = build_feature_chart_data(progress, selected_features, normalize_chart)
                color_map = {config["label"]: config["color"] for config in GROUP_CHART_FEATURES.values()}
                fig = px.line(
                    chart_data,
                    x="treino_label",
                    y="valor_plot",
                    color="metrica",
                    markers=True,
                    color_discrete_map=color_map,
                    custom_data=["metrica", "valor_formatado"],
                    labels={
                        "data": "Data",
                        "valor_plot": "Escala normalizada (0-100)" if normalize_chart else "Valor",
                        "metrica": "Métrica",
                    },
                )
                fig.update_traces(
                    line={"width": 3},
                    marker={"size": 9},
                    hovertemplate=("<b>%{customdata[0]}</b><br>Treino: %{x}<br>Valor: %{customdata[1]}<extra></extra>"),
                )
                theme_figure(fig)
                fig.update_layout(
                    title=f"Evolução: {focused_exercise}",
                    hovermode="x unified",
                )
                if not normalize_chart and all(
                    GROUP_CHART_FEATURES[feature]["decimals"] == 0 for feature in selected_features
                ):
                    fig.update_yaxes(tickformat="d")
                st.plotly_chart(fig, width="stretch")

            with st.expander("Como ler este gráfico"):
                st.write(
                    "Em valores reais, cada linha usa a própria unidade da métrica escolhida. "
                    "Se as escalas ficarem muito diferentes, use `Normalizado 0-100`: "
                    "cada linha passa a mostrar a evolução relativa dentro do período selecionado."
                )

            exercise_summary = (
                group_view.groupby(["variante_id", "exercicio", "tipo", "base_carga", "local"], as_index=False)
                .agg(
                    volume=("volume", "sum"),
                    series=("serie", "count"),
                    repeticoes=("repeticoes", "sum"),
                    dias=("data", "nunique"),
                    maior_carga=("peso_kg", "max"),
                )
                .sort_values(["exercicio", "tipo"])
            )
            st.dataframe(
                exercise_summary.rename(
                    columns={
                        "exercicio": "Exercício",
                        "tipo": "Tipo",
                        "series": "Séries",
                        "repeticoes": "Repetições",
                        "dias": "Dias",
                        "maior_carga": "Maior carga",
                        "volume": "Volume",
                    }
                ),
                width="stretch",
                hide_index=True,
            )

with tab_recent:
    render_recent_workouts(filtered, theme_figure=theme_figure)

with tab_records:
    st.subheader("Melhores marcas por exercício")

    records = (
        filtered.sort_values(["peso_kg", "repeticoes"], ascending=False)
        .groupby(["variante_id", "exercicio", "tipo", "base_carga", "local"], as_index=False)
        .first()
        .sort_values(["grupo_muscular", "exercicio", "tipo"])
    )

    records_table = records[
        [
            "grupo_muscular",
            "exercicio",
            "tipo",
            "data",
            "peso_kg",
            "repeticoes",
            "volume",
        ]
    ].rename(
        columns={
            "grupo_muscular": "Grupo",
            "exercicio": "Exercício",
            "tipo": "Tipo",
            "data": "Data",
            "peso_kg": "Maior carga",
            "repeticoes": "Reps",
            "volume": "Volume da série",
        }
    )
    st.dataframe(records_table, width="stretch", hide_index=True)

with tab_data:
    st.subheader("Dados filtrados")
    st.dataframe(
        filtered.sort_values(["data", "grupo_muscular", "exercicio", "serie"]),
        width="stretch",
        hide_index=True,
    )

    csv_bytes = filtered.to_csv(index=False).encode("utf-8-sig")
    st.download_button(
        "Baixar CSV filtrado",
        data=csv_bytes,
        file_name="academia_filtrado.csv",
        mime="text/csv",
    )
