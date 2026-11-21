"""Persist imported history without depending on the WhatsApp orchestrator."""

import uuid
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from gym_tracker.models import ParseMethod, ParseResult, ParseResultStatus, ParseStatus, RawMessage, Workout, WorkoutSet
from gym_tracker.repositories.catalog import get_or_create_exercise, get_or_create_variant
from gym_tracker.schemas import WorkoutExtraction
from gym_tracker.services.loads import validate_materializable_load
from gym_tracker.services.validation import extraction_materialization_reasons


def materialize_extraction(
    session: Session,
    user_id: uuid.UUID,
    raw_message: RawMessage,
    parse_result: ParseResult,
    extraction: WorkoutExtraction,
    parser_version: str,
    parse_method: str = ParseMethod.RULE.value,
    llm_model: str | None = None,
) -> int:
    invariant_reasons = extraction_materialization_reasons(extraction)
    if invariant_reasons:
        raise ValueError(f"extracao nao materializavel: {'; '.join(invariant_reasons)}")
    for exercise_payload in extraction.exercises:
        if not exercise_payload.canonical_name or not exercise_payload.muscle_group or not exercise_payload.equipment:
            raise ValueError(f"extracao incompleta para {exercise_payload.raw_name}")

    workout = Workout(
        user_id=user_id,
        workout_date=extraction.workout_date,
        workout_type=extraction.workout_type,
        notes=extraction.notes,
        source="whatsapp",
    )
    session.add(workout)
    session.flush()
    created = 0
    variant_set_counters: dict[uuid.UUID, int] = defaultdict(int)
    for position, exercise_payload in enumerate(extraction.exercises, start=1):
        exercise = get_or_create_exercise(session, exercise_payload.canonical_name, exercise_payload.muscle_group)
        variant = get_or_create_variant(
            session,
            exercise,
            exercise_payload.equipment,
            exercise_payload.load_basis,
        )
        for item in exercise_payload.sets:
            validate_materializable_load(
                item.weight_kg, equipment=exercise_payload.equipment, load_basis=exercise_payload.load_basis
            )
            variant_set_counters[variant.id] += 1
            session.add(
                WorkoutSet(
                    workout=workout,
                    exercise_variant=variant,
                    raw_message=raw_message,
                    parse_result=parse_result,
                    set_number=variant_set_counters[variant.id],
                    exercise_position=position,
                    weight_kg=item.weight_kg,
                    reps=item.reps,
                    rpe=item.rpe,
                    rir=item.rir,
                    parse_method=parse_method,
                    parser_version=parser_version,
                    llm_model=llm_model,
                )
            )
            created += 1
    if created == 0:
        session.delete(workout)
        session.flush()
        raise ValueError("extracao materializada sem series")
    session.flush()
    return created


def activate_result(session: Session, result: ParseResult) -> None:
    previous = session.scalar(
        select(ParseResult)
        .where(
            ParseResult.raw_message_id == result.raw_message_id,
            ParseResult.is_active.is_(True),
            ParseResult.id != result.id,
        )
        .with_for_update()
    )
    if previous is not None:
        previous.is_active = False
        session.flush([previous])
    result.status = ParseResultStatus.ACCEPTED.value
    result.is_active = True
    result.activated_at = datetime.now(UTC)
    result.raw_message.parse_status = ParseStatus.ACCEPTED.value
    session.flush()
