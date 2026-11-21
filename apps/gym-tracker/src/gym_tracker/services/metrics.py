import pandas as pd

GROUP_LABELS = {"Antebraco": "Antebraço", "Biceps": "Bíceps", "Triceps": "Tríceps", "Abdomen": "Abdômen"}
EXERCISE_LABELS = {
    "Antebraco dentro": "Antebraço dentro",
    "Antebraco puxada": "Antebraço puxada",
    "Biceps": "Bíceps",
    "Biceps antebraco": "Bíceps antebraço",
    "Biceps hack": "Bíceps hack",
    "Biceps zottman": "Bíceps zottman",
    "Triceps": "Tríceps",
    "Triceps unilateral": "Tríceps unilateral",
}
TYPE_LABELS = {"Maquina": "Máquina", "Maquina com anilha": "Máquina com anilha"}


def prepare_dashboard_dataframe(data: pd.DataFrame) -> pd.DataFrame:
    df = data.copy()
    df["data"] = pd.to_datetime(df["data"])
    df["peso_kg"] = pd.to_numeric(df["peso_kg"], errors="coerce")
    df["serie"] = pd.to_numeric(df["serie"], errors="coerce").astype("Int64")
    df["repeticoes"] = pd.to_numeric(df["repeticoes"], errors="coerce").astype("Int64")
    df = df.dropna(subset=["data", "peso_kg", "repeticoes"])
    df["grupo_muscular"] = df["grupo_muscular"].replace(GROUP_LABELS)
    df["exercicio"] = df["exercicio"].replace(EXERCISE_LABELS)
    df["tipo"] = df["tipo"].replace(TYPE_LABELS)
    # Legacy CSVs have only day/name/equipment. Database-backed analyses retain
    # authoritative IDs; this fallback never replaces IDs that are provided.
    if "treino_id" not in df:
        df["treino_id"] = df["data"].astype(str)
    if "base_carga" not in df:
        df["base_carga"] = df["tipo"].map(
            lambda value: "por_halter" if value == "Halter" else "adicional" if value == "Peso corporal" else "total"
        )
    if "local" not in df:
        df["local"] = ""
    if "variante_id" not in df:
        df["variante_id"] = df[["exercicio", "tipo", "base_carga", "local"]].astype(str).agg("|".join, axis=1)
    df["treino_id"] = df["treino_id"].astype(str)
    df["variante_id"] = df["variante_id"].astype(str)
    df["volume"] = df["peso_kg"] * df["repeticoes"]
    df["semana"] = df["data"].dt.to_period("W-SUN").dt.start_time
    df["mes"] = df["data"].dt.to_period("M").dt.to_timestamp()
    df["exercicio_tipo"] = df["exercicio"] + " - " + df["tipo"]
    df["exercicio_tipo"] += " · " + df["base_carga"] + df["local"].map(lambda value: f" · {value}" if value else "")
    # Equal labels may refer to distinct apparatus variants. Keep selectors unambiguous.
    duplicated = df.groupby("exercicio_tipo")["variante_id"].transform("nunique").gt(1)
    df.loc[duplicated, "exercicio_tipo"] += " · " + df.loc[duplicated, "variante_id"].str[:8]
    sessions = df[["data", "treino_id"]].drop_duplicates().sort_values("data", kind="stable")
    counts = sessions.groupby("data")["treino_id"].transform("size")
    ordinals = sessions.groupby("data").cumcount().add(1)
    sessions["treino_label"] = sessions["data"].dt.strftime("%d/%m/%Y")
    sessions.loc[counts.gt(1), "treino_label"] += " · treino " + ordinals[counts.gt(1)].astype(str)
    sessions["treino_ordem"] = range(len(sessions))
    return df.merge(sessions, on=["data", "treino_id"], validate="many_to_one")
