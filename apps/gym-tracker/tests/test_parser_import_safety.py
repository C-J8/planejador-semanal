from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gym_tracker.config import Settings
from gym_tracker.models import ExerciseVariant, ParseResult, ParseReview, User, WorkoutSet
from gym_tracker.repositories.catalog import get_or_create_exercise, save_alias
from gym_tracker.repositories.dashboard import DashboardRepository
from gym_tracker.schemas import ExercisePayload, SetPayload, WorkoutExtraction
from gym_tracker.services.llm_extractor import MockWorkoutExtractor
from gym_tracker.services.reviews import accept_review
from gym_tracker.services.validation import ReviewReasonKind, classify_review_reason, llm_auto_accept_blockers
from gym_tracker.services.whatsapp_import import import_whatsapp_file


def import_settings(version: str = "parser-safety", **overrides) -> Settings:
    return Settings(_env_file=None, database_url="sqlite:///:memory:", parser_version=version, **overrides)


def test_skipped_exercise_is_not_materialized_with_the_performed_exercise(session: Session, user: User) -> None:
    source = b"01/01/2026 10:00 - Pessoa: Triceps corda cima(nfiz) 9.1kg/10rep .. 11.3kg/10rep\nExtensora 40kg/10rep"
    report = import_whatsapp_file(
        session, Path("synthetic.txt"), user.id, settings=import_settings(), source_bytes=source
    )
    assert report.messages_accepted == 1
    assert report.sets_accepted == 1
    data = DashboardRepository(session).workout_dataframe(user.id)
    assert data["exercicio"].tolist() == ["Extensora"]


@pytest.mark.parametrize("exercise_name", ["Extensora", "Movimento pessoal"])
@pytest.mark.parametrize("notation", ["10rep/0rep", "10rep/999rep", "10rep/rep", "4rep/4"])
def test_invalid_or_ambiguous_repetitions_cannot_be_auto_accepted_by_llm(
    session: Session, user: User, exercise_name: str, notation: str
) -> None:
    exercise = get_or_create_exercise(session, "Extensora", "Pernas")
    save_alias(session, "Movimento pessoal", exercise, "Máquina", user.id)
    session.commit()
    proposal = WorkoutExtraction(
        workout_date=date(2026, 1, 1),
        exercises=[
            ExercisePayload(
                raw_name=exercise_name,
                canonical_name="Extensora",
                muscle_group="Pernas",
                equipment="Máquina",
                sets=[SetPayload(weight_kg=40, reps=10)],
            )
        ],
    )
    extractor = MockWorkoutExtractor(result=proposal)
    report = import_whatsapp_file(
        session,
        Path("synthetic.txt"),
        user.id,
        settings=import_settings(llm_shadow_mode=False, llm_auto_accept=True),
        source_bytes=f"01/01/2026 10:00 - Pessoa: {exercise_name} 40kg/{notation}".encode(),
        extractor=extractor,
    )
    review = session.scalar(select(ParseReview))
    assert report.messages_accepted == 0
    assert report.messages_pending_review == 1
    assert session.scalar(select(func.count()).select_from(WorkoutSet)) == 0
    assert review is not None and "repeticoes" in review.reason
    assert review.proposed_payload["llm"] == proposal.model_dump(mode="json")
    assert extractor.calls == 1


def test_reprocessing_ambiguous_source_preserves_the_previous_human_decision(session: Session, user: User) -> None:
    source = b"01/01/2026 10:00 - Pessoa: Extensora 40kg/4rep/4"
    import_whatsapp_file(session, Path("synthetic.txt"), user.id, settings=import_settings("v1"), source_bytes=source)
    review = session.scalar(select(ParseReview))
    correction = WorkoutExtraction(
        workout_date=date(2026, 1, 1),
        exercises=[
            ExercisePayload(
                raw_name="Extensora",
                canonical_name="Extensora",
                muscle_group="Pernas",
                equipment="Máquina",
                sets=[SetPayload(weight_kg=40, reps=4), SetPayload(weight_kg=40, reps=4)],
            )
        ],
    )
    accept_review(session, review.id, correction.model_dump(mode="json"))
    session.commit()
    before = list(session.execute(select(WorkoutSet.id, WorkoutSet.weight_kg, WorkoutSet.reps)).all())
    active_id = session.scalar(select(ParseResult.id).where(ParseResult.is_active.is_(True)))

    report = import_whatsapp_file(
        session, Path("synthetic.txt"), user.id, settings=import_settings("v2"), source_bytes=source
    )
    session.commit()
    assert report.messages_pending_review == 1
    assert report.sets_accepted == 0
    assert session.scalar(select(ParseResult.id).where(ParseResult.is_active.is_(True))) == active_id
    assert list(session.execute(select(WorkoutSet.id, WorkoutSet.weight_kg, WorkoutSet.reps)).all()) == before
    assert len(DashboardRepository(session).workout_dataframe(user.id)) == 2
    assert review.status == "accepted"


def test_plate_loaded_machine_reaches_the_database_without_generic_machine_alias(session: Session, user: User) -> None:
    exercise = get_or_create_exercise(session, "Supino inclinado", "Peito")
    save_alias(session, "supino inclinado máquina com anilha", exercise, "Máquina", user.id)
    session.commit()
    report = import_whatsapp_file(
        session,
        Path("synthetic.txt"),
        user.id,
        settings=import_settings(),
        source_bytes="01/01/2026 10:00 - Pessoa: Supino inclinado máquina com anilha 40kg/10rep".encode(),
    )
    variant = session.scalar(select(ExerciseVariant).join(WorkoutSet))
    assert report.messages_accepted == 1
    assert variant.equipment == "Máquina com anilha"
    assert variant.load_basis == "total"


def test_repetition_ambiguity_is_a_concrete_blocker_for_llm() -> None:
    reason = "abreviacao de repeticoes ambigua: Extensora 40kg/4rep/4"
    assert classify_review_reason(reason) == ReviewReasonKind.AMBIGUOUS_OR_SUSPICIOUS
    assert llm_auto_accept_blockers([reason]) == [reason]
