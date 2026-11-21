"""Independent sessions, routines and private access accounts.

Historical sessions remain completed, with unknown start/end times.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workouts") as batch:
        batch.add_column(sa.Column("status", sa.String(20), nullable=False, server_default="completed"))
        batch.add_column(sa.Column("started_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("completed_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(
            sa.Column(
                "routine_snapshot", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False, server_default="{}"
            )
        )
        batch.add_column(
            sa.Column("content", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False, server_default="{}")
        )
        batch.create_check_constraint("ck_workout_status", "status IN ('draft','in_progress','completed','cancelled')")
    with op.batch_alter_table("sets") as batch:
        batch.alter_column("parse_result_id", existing_type=sa.Uuid(), nullable=True)
        batch.add_column(sa.Column("exercise_position", sa.Integer()))
        batch.create_unique_constraint(
            "uq_set_workout_variant_number", ["workout_id", "exercise_variant_id", "set_number"]
        )
    op.create_table(
        "workout_routines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("content", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_workout_routines_user_id", "workout_routines", ["user_id"])
    op.create_table(
        "login_accounts",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("login", sa.String(120), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "access_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_access_sessions_user_id", "access_sessions", ["user_id"])


def downgrade() -> None:
    connection = op.get_bind()
    if any(
        connection.scalar(sa.text(statement))
        for statement in (
            "SELECT count(*) FROM sets WHERE parse_result_id IS NULL",
            "SELECT count(*) FROM workouts WHERE source = 'app'",
            "SELECT count(*) FROM workout_routines",
            "SELECT count(*) FROM login_accounts",
            "SELECT count(*) FROM access_sessions",
        )
    ):
        raise RuntimeError("O banco contém dados do app. Restaure um backup compatível para retornar à 0004.")
    for table in ("access_sessions", "login_accounts", "workout_routines"):
        op.drop_table(table)
    with op.batch_alter_table("sets") as batch:
        batch.drop_constraint("uq_set_workout_variant_number", type_="unique")
        batch.drop_column("exercise_position")
        batch.alter_column("parse_result_id", existing_type=sa.Uuid(), nullable=False)
    with op.batch_alter_table("workouts") as batch:
        batch.drop_constraint("ck_workout_status", type_="check")
        for column in ("content", "routine_snapshot", "revision", "completed_at", "started_at", "status"):
            batch.drop_column(column)
