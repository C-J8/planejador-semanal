from pathlib import Path

import pandas as pd
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from gym_tracker.config import Settings, get_settings
from gym_tracker.models import ParseReview, User, WorkoutSet
from gym_tracker.repositories.dashboard import DashboardRepository
from gym_tracker.schemas import ExercisePayload, ParseOutcome, SetPayload, WorkoutExtraction
from gym_tracker.services.metrics import prepare_dashboard_dataframe
from gym_tracker.services.reviews import accept_review
from gym_tracker.services.validation import review_reasons
from gym_tracker.services.whatsapp_import import import_whatsapp_file


def bodyweight_payload(equipment: str = "Peso corporal", load_basis: str = "adicional") -> WorkoutExtraction:
    return WorkoutExtraction(
        workout_date="2026-08-06",
        exercises=[
            ExercisePayload(
                raw_name="Abd infra",
                canonical_name="Abdominal infra",
                muscle_group="Abdômen",
                equipment=equipment,
                load_basis=load_basis,
                sets=[SetPayload(weight_kg=0, reps=10) for _ in range(3)],
            )
        ],
    )


def pending_bodyweight_review(session: Session, user: User) -> ParseReview:
    report = import_whatsapp_file(
        session,
        Path("synthetic.txt"),
        user.id,
        settings=Settings(_env_file=None, openai_api_key=None),
        source_bytes=b"06/08/2026 20:56 - Pessoa: Abd infra 10rep/10rep/10rep",
    )
    assert report.messages_pending_review == 1
    return session.scalar(select(ParseReview).where(ParseReview.status == "pending"))


def test_manual_review_preserves_three_bodyweight_sets(session: Session, user: User) -> None:
    review = pending_bodyweight_review(session, user)
    payload = bodyweight_payload()
    assert review_reasons(ParseOutcome(extraction=payload)) == []
    accept_review(session, review.id, payload.model_dump(mode="json"))
    session.commit()
    data = prepare_dashboard_dataframe(DashboardRepository(session).workout_dataframe(user.id))
    assert len(data) == 3
    assert data["repeticoes"].sum() == 30
    assert data["peso_kg"].eq(0).all()
    assert data["volume"].eq(0).all()
    assert review.status == "accepted"


@pytest.mark.parametrize(
    ("equipment", "load_basis"),
    [("Máquina", "total"), ("Máquina", "adicional"), ("Peso corporal", "total")],
)
def test_zero_load_requires_bodyweight_and_explicit_additional_load(
    session: Session, user: User, equipment: str, load_basis: str
) -> None:
    review = pending_bodyweight_review(session, user)
    payload = bodyweight_payload(equipment, load_basis)
    assert review_reasons(ParseOutcome(extraction=payload))
    with pytest.raises(ValueError, match="nao materializavel"):
        accept_review(session, review.id, payload.model_dump(mode="json"))
    assert session.scalar(select(func.count()).select_from(WorkoutSet)) == 0
    assert review.status == "pending"


def test_bodyweight_with_added_load_uses_only_additional_load_for_volume() -> None:
    data = pd.DataFrame(
        [
            {
                "data": "2026-08-06",
                "grupo_muscular": "Abdômen",
                "exercicio": "Abdominal infra",
                "tipo": "Peso corporal",
                "peso_kg": 5,
                "serie": 1,
                "repeticoes": 10,
            }
        ]
    )
    prepared = prepare_dashboard_dataframe(data)
    assert prepared.iloc[0]["volume"] == 50
    assert prepared.iloc[0]["peso_kg"] == 5
    assert prepared.iloc[0]["repeticoes"] == 10


def test_dashboard_renders_when_only_bodyweight_sets_are_selected(monkeypatch) -> None:
    from streamlit.testing.v1 import AppTest

    data = pd.DataFrame(
        [
            {
                "data": "2026-08-06",
                "grupo_muscular": "Abdômen",
                "exercicio": "Abdominal infra",
                "tipo": "Peso corporal",
                "peso_kg": 0,
                "serie": number,
                "repeticoes": 10,
            }
            for number in range(1, 4)
        ]
    )
    prepared = prepare_dashboard_dataframe(data)
    monkeypatch.setattr("gym_tracker.data_adapter.load_dashboard_data", lambda: prepared)
    monkeypatch.setattr("gym_tracker.data_adapter.data_signature", lambda: "bodyweight-review-ui")
    app = AppTest.from_file("app.py").run(timeout=30)
    assert not app.exception
    assert app.metric[1].value == "3"
    assert app.metric[2].value == "30"
    assert app.metric[3].value == "0,0 kg"


def test_bodyweight_migration_preserves_weighted_sets_and_blocks_lossy_downgrade(tmp_path, monkeypatch) -> None:
    database = tmp_path / "bodyweight.sqlite"
    url = f"sqlite:///{database.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    command.upgrade(config, "0003")
    engine = create_engine(url)
    try:
        with Session(engine) as session:
            user = User(display_name="Pessoa de teste")
            session.add(user)
            session.flush()
            import_whatsapp_file(
                session,
                Path("weighted.txt"),
                user.id,
                settings=Settings(_env_file=None, openai_api_key=None),
                source_bytes=b"05/08/2026 20:56 - Pessoa: Extensora 40kg/10rep",
            )
            review_id = pending_bodyweight_review(session, user).id
            session.commit()
        command.upgrade(config, "head")
        command.check(config)
        with Session(engine) as session:
            accept_review(session, review_id, bodyweight_payload().model_dump(mode="json"))
            session.commit()
            assert sorted(session.scalars(select(WorkoutSet.weight_kg))) == [0, 0, 0, 40]
        with pytest.raises(RuntimeError, match="peso corporal"):
            command.downgrade(config, "0003")
        with Session(engine) as session:
            assert sorted(session.scalars(select(WorkoutSet.weight_kg))) == [0, 0, 0, 40]
    finally:
        engine.dispose()
        get_settings.cache_clear()
