import hashlib
import uuid
from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from gym_tracker.api import create_app
from gym_tracker.models import AccessSession, LoginAccount, User, Workout, WorkoutSet
from gym_tracker.repositories.catalog import get_or_create_exercise, get_or_create_variant
from gym_tracker.repositories.dashboard import DashboardRepository
from gym_tracker.services.accounts import login, provision_account
from gym_tracker.services.metrics import prepare_dashboard_dataframe
from gym_tracker.services.recent_workouts import recent_group_workouts, recent_workout_insights, summarize_exercise_days
from gym_tracker.services.workouts import (
    Conflict,
    RoutineContent,
    save_routine,
    save_workout,
    start_workout,
    transition_workout,
)


def content(variant, weight=30, reps=10):
    return RoutineContent(
        name="Treino A", exercises=[{"variant_id": variant.id, "sets": [{"weight_kg": weight, "reps": reps}]}]
    )


@pytest.fixture
def variant(session):
    exercise = get_or_create_exercise(session, "Extensora", "Pernas")
    return get_or_create_variant(session, exercise, "Máquina", "total")


def test_routine_changes_never_modify_started_session_and_retries_are_idempotent(session, user, variant):
    routine = save_routine(session, user.id, uuid.uuid4(), content(variant))
    workout_id = uuid.uuid4()
    workout = start_workout(session, user.id, workout_id, date(2026, 1, 1), routine.id)
    assert start_workout(session, user.id, workout_id, date(2026, 1, 1), routine.id).id == workout_id
    assert workout.sets == []  # Planned targets are not completed sets.
    save_routine(session, user.id, routine.id, content(variant, weight=60), expected_revision=1)
    assert workout.routine_snapshot["content"]["exercises"][0]["sets"][0]["weight_kg"] == "30"
    save_workout(session, user.id, workout_id, content(variant), expected_revision=1)
    set_id = workout.sets[0].id
    with pytest.raises(Conflict, match="mudou"):
        save_workout(session, user.id, workout_id, content(variant, weight=45), expected_revision=1)
    assert workout.sets[0].id == set_id
    assert DashboardRepository(session).workout_dataframe(user.id).empty
    transition_workout(session, user.id, workout_id, "completed")
    completion = workout.completed_at
    transition_workout(session, user.id, workout_id, "completed")
    assert workout.completed_at == completion
    assert len(DashboardRepository(session).workout_dataframe(user.id)) == 1
    assert workout.sets[0].parse_result_id is None
    assert workout.sets[0].raw_message_id is None


def test_cancelled_session_is_not_counted_and_cannot_complete_empty_workout(session, user, variant):
    workout = start_workout(session, user.id, uuid.uuid4(), date(2026, 1, 1))
    with pytest.raises(ValueError, match="série"):
        transition_workout(session, user.id, workout.id, "completed")
    save_workout(session, user.id, workout.id, content(variant), expected_revision=1)
    transition_workout(session, user.id, workout.id, "cancelled")
    assert DashboardRepository(session).workout_dataframe(user.id).empty
    with pytest.raises(Conflict):
        transition_workout(session, user.id, workout.id, "completed")


def test_same_day_sessions_and_same_named_variants_remain_separate(session, user, variant):
    other = get_or_create_variant(session, variant.exercise, "Máquina", "total", gym_or_location="Outra academia")
    for index, machine in enumerate((variant, other, variant)):
        workout = start_workout(session, user.id, uuid.uuid4(), date(2026, 1, 1))
        save_workout(session, user.id, workout.id, content(machine, weight=30 + index), 1)
        transition_workout(session, user.id, workout.id, "completed")
    data = prepare_dashboard_dataframe(DashboardRepository(session).workout_dataframe(user.id))
    assert data["data"].nunique() == 1
    assert data["treino_id"].nunique() == 3
    assert data["variante_id"].nunique() == 2
    recent = recent_group_workouts(data, "Pernas", limit=2)
    assert recent["treino_id"].nunique() == 2
    summary = summarize_exercise_days(recent)
    assert len(summary) == 2
    assert summary["series"].tolist() == [1, 1]
    # A new apparatus is not compared against the previous apparatus's load.
    assert all("melhor série passou" not in line for line in recent_workout_insights(summary))
    pd.testing.assert_frame_equal(
        data, prepare_dashboard_dataframe(DashboardRepository(session).workout_dataframe(user.id))
    )


def test_two_people_api_login_isolation_lifecycle_and_logout(session, user, variant):
    second = User(display_name="Amigo")
    session.add(second)
    session.flush()
    provision_account(session, user.id, "pessoa", "senha de teste longa")
    provision_account(session, second.id, "amigo", "outra senha longa")
    session.commit()
    app = create_app(engine=session.get_bind())
    with TestClient(app) as client:
        assert client.get("/workouts").status_code == 401
        assert client.post("/auth/login", json={"login": "pessoa", "password": "errada"}).status_code == 401
        session.expire_all()
        assert session.get(LoginAccount, user.id).failed_attempts == 1
        response = client.post("/auth/login", json={"login": "pessoa", "password": "senha de teste longa"})
        token = response.json()["access_token"]
        owner = {"Authorization": f"Bearer {token}"}
        second_token = client.post("/auth/login", json={"login": "amigo", "password": "outra senha longa"}).json()[
            "access_token"
        ]
        friend = {"Authorization": f"Bearer {second_token}"}
        assert client.get("/me", headers=owner).json()["id"] == str(user.id)
        workout_id, routine_id = str(uuid.uuid4()), str(uuid.uuid4())
        routine = {"revision": 0, "content": content(variant).model_dump(mode="json")}
        assert client.put(f"/routines/{routine_id}", json=routine, headers=owner).status_code == 200
        assert client.get("/routines", headers=friend).json() == []
        body = {"id": workout_id, "workout_date": "2026-01-01", "routine_id": routine_id}
        response = client.post("/workouts", json=body, headers=owner)
        assert response.status_code == 200, response.text
        assert client.post("/workouts", json=body, headers=owner).json()["id"] == workout_id
        assert client.get(f"/workouts/{workout_id}", headers=friend).status_code == 404
        assert client.post("/workouts", json=body, headers=friend).status_code == 404
        update = {"revision": 1, "content": content(variant).model_dump(mode="json")}
        assert client.put(f"/workouts/{workout_id}", json=update, headers=friend).status_code == 404
        assert client.post(f"/workouts/{workout_id}/complete", headers=friend).status_code == 404
        assert client.put(f"/workouts/{workout_id}", json=update, headers=owner).status_code == 200
        assert client.put(f"/workouts/{workout_id}", json=update, headers=owner).status_code == 409
        assert client.post(f"/workouts/{workout_id}/complete", headers=owner).status_code == 200
        assert client.post(f"/workouts/{workout_id}/complete", headers=owner).status_code == 200
        assert len(client.get("/history", headers=owner).json()) == 1
        assert client.get("/history", headers=friend).json() == []
        forged = {**body, "user_id": str(user.id)}
        assert client.post("/workouts", json=forged, headers=friend).status_code == 422
        assert client.get("/workouts", headers=friend).json() == []
        assert client.post("/auth/logout", headers=owner).status_code == 204
        assert client.get("/me", headers=owner).status_code == 401
        assert client.get("/me", headers=friend).status_code == 200


def test_expired_sessions_and_passwords_are_not_exposed(session, user):
    account = provision_account(session, user.id, "pessoa", "senha de teste longa")
    assert "senha de teste longa" not in account.password_hash
    token = login(session, "pessoa", "senha de teste longa")
    digest = hashlib.sha256(token.encode()).hexdigest()
    record = session.get(AccessSession, digest)
    assert record.token_hash != token
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()
    with TestClient(create_app(engine=session.get_bind())) as client:
        assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
        response = client.post("/auth/login", json={"login": "pessoa", "password": "secret", "user_id": "fake"})
        assert response.status_code == 422
        assert "secret" not in response.text
    assert len(list(session.scalars(select(WorkoutSet)))) == 0
    assert len(list(session.scalars(select(Workout)))) == 0


def test_repeated_failed_login_is_limited_and_catalog_does_not_expose_private_locations(session, user, variant):
    private = get_or_create_variant(session, variant.exercise, "Máquina", "total", gym_or_location="Local privado")
    provision_account(session, user.id, "pessoa", "senha de teste longa")
    session.commit()
    with TestClient(create_app(engine=session.get_bind())) as client:
        for _ in range(5):
            assert client.post("/auth/login", json={"login": "pessoa", "password": "errada"}).status_code == 401
        valid = {"login": "pessoa", "password": "senha de teste longa"}
        assert client.post("/auth/login", json=valid).status_code == 401
        session.expire_all()
        account = session.get(LoginAccount, user.id)
        assert account.failed_attempts == 5
        account.locked_until = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
        token = client.post("/auth/login", json=valid).json()["access_token"]
        catalog = client.get("/catalog", headers={"Authorization": f"Bearer {token}"})
        assert catalog.status_code == 200
        assert str(variant.id) in {item["id"] for item in catalog.json()}
        assert str(private.id) not in {item["id"] for item in catalog.json()}
