"""Private workout API. All owners come from authentication, never request JSON."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import create_engine, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from gym_tracker.config import Settings, get_settings
from gym_tracker.models import ExerciseVariant, Routine, User, Workout, WorkoutSet
from gym_tracker.repositories.dashboard import DashboardRepository
from gym_tracker.services import accounts
from gym_tracker.services.workouts import (
    Conflict,
    NotFound,
    RoutineContent,
    save_routine,
    save_workout,
    start_workout,
    transition_workout,
)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    login: str = Field(min_length=1, max_length=120)
    password: SecretStr = Field(min_length=1, max_length=256)


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    workout_date: date
    routine_id: uuid.UUID | None = None


class SaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(strict=True, ge=0)
    content: RoutineContent
    notes: str | None = Field(default=None, max_length=4000)


def workout_json(item: Workout) -> dict:
    return {
        "id": item.id,
        "workout_date": item.workout_date,
        "name": item.workout_type,
        "status": item.status,
        "source": item.source,
        "revision": item.revision,
        "notes": item.notes,
        "started_at": item.started_at,
        "completed_at": item.completed_at,
        "routine_snapshot": item.routine_snapshot,
        "content": item.content,
        "sets": [
            {
                "id": row.id,
                "variant_id": row.exercise_variant_id,
                "number": row.set_number,
                "position": row.exercise_position,
                "weight_kg": str(row.weight_kg),
                "reps": row.reps,
            }
            for row in sorted(
                item.sets, key=lambda row: (row.exercise_position or 0, str(row.exercise_variant_id), row.set_number)
            )
        ],
    }


def create_app(settings: Settings | None = None, *, engine=None) -> FastAPI:
    settings = settings or get_settings()
    engine = engine if engine is not None else create_engine(settings.database_url, pool_pre_ping=True)
    app = FastAPI(title="Academia", version="0.1.0")
    bearer = HTTPBearer(auto_error=False)

    def database():
        with Session(engine) as session:
            try:
                yield session
                session.commit()
            except accounts.Unauthorized:
                # Persist failed-login counters, without accepting workout writes.
                session.commit()
                raise
            except Exception:
                session.rollback()
                raise

    DB = Annotated[Session, Depends(database)]

    def current_user(session: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
        if credentials is None:
            raise accounts.Unauthorized("Entre para acessar seus treinos.")
        user_id = accounts.authenticate(session, credentials.credentials)
        if engine.dialect.name == "postgresql":
            # The importer uses the same per-user lock. Serializes idempotent
            # session creation, revisions and completion across workers.
            session.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": int.from_bytes(user_id.bytes[:8], "big", signed=True)},
            )
        return user_id

    Owner = Annotated[uuid.UUID, Depends(current_user)]

    @app.exception_handler(accounts.Unauthorized)
    async def unauthorized(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=401, headers={"WWW-Authenticate": "Bearer"})

    @app.exception_handler(NotFound)
    async def not_found(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=404)

    @app.exception_handler(Conflict)
    async def conflict(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=409)

    @app.exception_handler(ValueError)
    async def bad_input(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=422)

    @app.exception_handler(IntegrityError)
    async def duplicate(_request, _error):
        return JSONResponse({"detail": "Conflito ao salvar. Atualize e tente novamente."}, status_code=409)

    @app.exception_handler(RequestValidationError)
    async def invalid_body(_request, error):
        # FastAPI's default includes submitted values, including login secrets.
        return JSONResponse(
            {"detail": [{"loc": list(item["loc"]), "msg": item["msg"]} for item in error.errors()]}, status_code=422
        )

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/auth/login")
    def login(body: LoginRequest, session: DB):
        return {
            "access_token": accounts.login(session, body.login, body.password.get_secret_value()),
            "token_type": "bearer",
            "expires_in": 86400,
        }

    @app.post("/auth/logout", status_code=204)
    def logout(session: DB, owner: Owner, credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)]):
        accounts.logout(session, credentials.credentials)
        return Response(status_code=204)

    @app.get("/me")
    def me(session: DB, owner: Owner):
        user = session.get(User, owner)
        return {"id": user.id, "display_name": user.display_name}

    @app.get("/catalog")
    def catalog(session: DB, owner: Owner):
        used_by_owner = (
            select(WorkoutSet.id)
            .join(Workout)
            .where(WorkoutSet.exercise_variant_id == ExerciseVariant.id, Workout.user_id == owner)
            .exists()
        )
        variants = session.scalars(
            select(ExerciseVariant)
            .where(or_(ExerciseVariant.gym_or_location == "", used_by_owner))
            .order_by(ExerciseVariant.id)
        )
        return [
            {
                "id": row.id,
                "exercise": row.exercise.canonical_name,
                "muscle_group": row.exercise.muscle_group,
                "equipment": row.equipment,
                "load_basis": row.load_basis,
                "location": row.gym_or_location,
            }
            for row in variants
        ]

    @app.get("/routines")
    def routines(session: DB, owner: Owner):
        return [
            {"id": row.id, "revision": row.revision, "content": row.content}
            for row in session.scalars(select(Routine).where(Routine.user_id == owner).order_by(Routine.created_at))
        ]

    @app.put("/routines/{routine_id}")
    def put_routine(routine_id: uuid.UUID, body: SaveRequest, session: DB, owner: Owner):
        row = save_routine(session, owner, routine_id, body.content, body.revision)
        return {"id": row.id, "revision": row.revision, "content": row.content}

    @app.get("/workouts")
    def workouts(session: DB, owner: Owner, limit: int = 50):
        if not 1 <= limit <= 200:
            raise HTTPException(422, "O limite deve ser de 1 a 200.")
        # Inactive imported versions remain in the database for audit only.
        from gym_tracker.models import ParseResult

        visible_import = (
            select(WorkoutSet.id)
            .join(ParseResult)
            .where(WorkoutSet.workout_id == Workout.id, ParseResult.is_active.is_(True))
            .exists()
        )
        rows = session.scalars(
            select(Workout)
            .where(Workout.user_id == owner, (Workout.source == "app") | visible_import)
            .order_by(
                Workout.workout_date.desc(), func.coalesce(Workout.started_at, Workout.created_at).desc(), Workout.id
            )
            .limit(limit)
        )
        return [workout_json(row) for row in rows]

    @app.post("/workouts")
    def post_workout(body: StartRequest, session: DB, owner: Owner):
        return workout_json(start_workout(session, owner, body.id, body.workout_date, body.routine_id))

    @app.get("/workouts/{workout_id}")
    def get_workout(workout_id: uuid.UUID, session: DB, owner: Owner):
        row = session.scalar(select(Workout).where(Workout.id == workout_id, Workout.user_id == owner))
        if row is None:
            raise NotFound("Treino não encontrado.")
        return workout_json(row)

    @app.put("/workouts/{workout_id}")
    def put_workout(workout_id: uuid.UUID, body: SaveRequest, session: DB, owner: Owner):
        return workout_json(save_workout(session, owner, workout_id, body.content, body.revision, body.notes))

    @app.post("/workouts/{workout_id}/{action}")
    def finish(workout_id: uuid.UUID, action: str, session: DB, owner: Owner):
        statuses = {"complete": "completed", "cancel": "cancelled"}
        if action not in statuses:
            raise NotFound("Ação não encontrada.")
        return workout_json(transition_workout(session, owner, workout_id, statuses[action]))

    @app.get("/history")
    def history(session: DB, owner: Owner):
        rows = DashboardRepository(session).workout_dataframe(owner)
        return rows.to_dict(orient="records")

    return app
