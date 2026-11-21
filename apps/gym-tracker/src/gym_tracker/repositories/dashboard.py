import uuid

import pandas as pd
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from gym_tracker.models import Exercise, ExerciseVariant, ParseResult, User, Workout, WorkoutSet


class DashboardRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def workout_dataframe(self, user_id: uuid.UUID | None = None) -> pd.DataFrame:
        statement = (
            select(
                Workout.workout_date.label("data"),
                Exercise.muscle_group.label("grupo_muscular"),
                Exercise.canonical_name.label("exercicio"),
                ExerciseVariant.equipment.label("tipo"),
                WorkoutSet.weight_kg.label("peso_kg"),
                WorkoutSet.set_number.label("serie"),
                WorkoutSet.reps.label("repeticoes"),
                Workout.id.label("treino_id"),
                ExerciseVariant.id.label("variante_id"),
                ExerciseVariant.load_basis.label("base_carga"),
                ExerciseVariant.gym_or_location.label("local"),
            )
            .join(WorkoutSet.workout)
            .join(WorkoutSet.exercise_variant)
            .join(ExerciseVariant.exercise)
            .outerjoin(WorkoutSet.parse_result)
            .where(
                Workout.status == "completed",
                or_(
                    ParseResult.is_active.is_(True), and_(Workout.source == "app", WorkoutSet.parse_result_id.is_(None))
                ),
            )
            .order_by(
                Workout.workout_date,
                func.coalesce(Workout.started_at, Workout.created_at),
                Workout.id,
                WorkoutSet.exercise_position,
                WorkoutSet.set_number,
            )
        )
        if user_id is not None:
            statement = statement.where(Workout.user_id == user_id)
        rows = self.session.execute(statement).mappings().all()
        columns = [
            "data",
            "grupo_muscular",
            "exercicio",
            "tipo",
            "peso_kg",
            "serie",
            "repeticoes",
            "treino_id",
            "variante_id",
            "base_carga",
            "local",
        ]
        return pd.DataFrame(rows, columns=columns)

    def users(self) -> list[User]:
        return list(self.session.scalars(select(User).order_by(User.display_name)))
