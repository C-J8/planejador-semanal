"""Workout operations shared by imports, reviews and the authenticated API.

The caller owns the transaction. Historical imports keep their parse provenance;
app sessions have no fabricated import, message, result or historical duration.
"""

import uuid
from copy import deepcopy
from datetime import UTC, date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from gym_tracker.models import ExerciseVariant, Routine, User, Workout, WorkoutSet
from gym_tracker.repositories.state import bump_data_revision
from gym_tracker.services.loads import validate_materializable_load


class NotFound(ValueError):
    pass


class Conflict(ValueError):
    pass


class SetEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weight_kg: Decimal = Field(ge=0, le=500, decimal_places=2)
    reps: int = Field(strict=True, gt=0, le=200)


class ExerciseEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variant_id: uuid.UUID
    sets: list[SetEntry] = Field(default_factory=list, max_length=50)
    rest_seconds: int = Field(default=90, strict=True, ge=0, le=3600)


class RoutineContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    exercises: list[ExerciseEntry] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def unique_variants(self):
        if len({item.variant_id for item in self.exercises}) != len(self.exercises):
            raise ValueError("Cada variante deve aparecer uma vez; agrupe suas séries.")
        if not self.name.strip():
            raise ValueError("Informe o nome da ficha.")
        return self


def _owned(session: Session, model, item_id: uuid.UUID, user_id: uuid.UUID):
    item = session.scalar(select(model).where(model.id == item_id, model.user_id == user_id).with_for_update())
    if item is None:
        raise NotFound("Registro não encontrado.")
    return item


def _check_revision(item, expected_revision: int) -> None:
    if item.revision != expected_revision:
        raise Conflict("Este registro mudou. Atualize antes de salvar.")


def _validate_content(session: Session, content: RoutineContent) -> None:
    for exercise in content.exercises:
        variant = session.get(ExerciseVariant, exercise.variant_id)
        if variant is None:
            raise ValueError("Variante de exercício não encontrada.")
        for entry in exercise.sets:
            validate_materializable_load(entry.weight_kg, equipment=variant.equipment, load_basis=variant.load_basis)


def save_routine(
    session: Session, user_id: uuid.UUID, routine_id: uuid.UUID, content: RoutineContent, expected_revision: int = 0
) -> Routine:
    if session.get(User, user_id) is None:
        raise NotFound("Pessoa não encontrada.")
    _validate_content(session, content)
    existing = session.get(Routine, routine_id)
    if existing is None:
        if expected_revision != 0:
            raise Conflict("Ficha não encontrada para esta revisão.")
        existing = Routine(id=routine_id, user_id=user_id, name=content.name, content=content.model_dump(mode="json"))
        session.add(existing)
    else:
        existing = _owned(session, Routine, routine_id, user_id)
        _check_revision(existing, expected_revision)
        existing.name = content.name
        existing.content = content.model_dump(mode="json")
        existing.revision += 1
    session.flush()
    return existing


def start_workout(
    session: Session, user_id: uuid.UUID, workout_id: uuid.UUID, workout_date: date, routine_id: uuid.UUID | None = None
) -> Workout:
    if session.get(User, user_id) is None:
        raise NotFound("Pessoa não encontrada.")
    existing = session.get(Workout, workout_id)
    if existing is not None:
        existing = _owned(session, Workout, workout_id, user_id)
        if (
            existing.source != "app"
            or existing.workout_date != workout_date
            or existing.routine_snapshot.get("routine_id") != (str(routine_id) if routine_id else None)
        ):
            raise Conflict("Este identificador já pertence a outro treino.")
        return existing
    snapshot = {}
    if routine_id:
        routine = _owned(session, Routine, routine_id, user_id)
        snapshot = {"routine_id": str(routine.id), "revision": routine.revision, "content": deepcopy(routine.content)}
    workout = Workout(
        id=workout_id,
        user_id=user_id,
        workout_date=workout_date,
        source="app",
        status="in_progress",
        started_at=datetime.now(UTC),
        routine_snapshot=snapshot,
        workout_type=snapshot.get("content", {}).get("name"),
        content={
            "name": snapshot.get("content", {}).get("name", "Treino"),
            "exercises": [{**exercise, "sets": []} for exercise in snapshot.get("content", {}).get("exercises", [])],
        },
    )
    session.add(workout)
    session.flush()
    return workout


def save_workout(
    session: Session,
    user_id: uuid.UUID,
    workout_id: uuid.UUID,
    content: RoutineContent,
    expected_revision: int,
    notes: str | None = None,
) -> Workout:
    workout = _owned(session, Workout, workout_id, user_id)
    _check_revision(workout, expected_revision)
    if workout.source != "app" or workout.status == "cancelled":
        raise Conflict("Este treino não aceita edição direta.")
    if workout.status == "completed" and not any(exercise.sets for exercise in content.exercises):
        raise ValueError("Um treino concluído precisa manter ao menos uma série.")
    _validate_content(session, content)
    existing = {(item.exercise_variant_id, item.set_number): item for item in workout.sets}
    kept = set()
    for position, exercise in enumerate(content.exercises, start=1):
        for number, entry in enumerate(exercise.sets, start=1):
            key = (exercise.variant_id, number)
            kept.add(key)
            item = existing.get(key)
            if item is None:
                item = WorkoutSet(
                    workout=workout,
                    exercise_variant_id=exercise.variant_id,
                    set_number=number,
                    parse_method="manual",
                    parser_version="app-v1",
                )
                session.add(item)
            item.weight_kg, item.reps, item.exercise_position = entry.weight_kg, entry.reps, position
    for key, item in existing.items():
        if key not in kept:
            session.delete(item)
    workout.workout_type, workout.notes = content.name, notes
    workout.content = content.model_dump(mode="json")
    workout.revision += 1
    bump_data_revision(session)
    session.flush()
    session.expire(workout, ["sets"])
    return workout


def transition_workout(session: Session, user_id: uuid.UUID, workout_id: uuid.UUID, status: str) -> Workout:
    if status not in {"completed", "cancelled"}:
        raise ValueError("Estado de destino inválido.")
    workout = _owned(session, Workout, workout_id, user_id)
    if workout.source != "app":
        raise Conflict("Treino importado deve ser corrigido pela revisão.")
    if workout.status == status:
        return workout
    if workout.status not in {"draft", "in_progress"}:
        raise Conflict("Este treino já foi finalizado.")
    if status == "completed" and not workout.sets:
        raise ValueError("Registre ao menos uma série antes de concluir.")
    workout.status = status
    workout.completed_at = datetime.now(UTC) if status == "completed" else None
    workout.revision += 1
    bump_data_revision(session)
    session.flush()
    return workout
