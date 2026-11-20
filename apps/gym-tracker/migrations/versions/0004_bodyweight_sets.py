"""Allow zero additional load for bodyweight sets.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("sets") as batch:
        batch.drop_constraint("ck_set_weight_range", type_="check")
        batch.create_check_constraint("ck_set_weight_range", "weight_kg >= 0 AND weight_kg <= 500")


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM sets WHERE weight_kg = 0")):
        raise RuntimeError("Downgrade bloqueado: existem series de peso corporal sem carga adicional.")
    with op.batch_alter_table("sets") as batch:
        batch.drop_constraint("ck_set_weight_range", type_="check")
        batch.create_check_constraint("ck_set_weight_range", "weight_kg > 0 AND weight_kg <= 500")
