"""Repair occurrence precision on databases created by early versions of 0002.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    columns = {column["name"] for column in sa.inspect(connection).get_columns("import_message_occurrences")}
    if "timestamp_precision" in columns:
        return
    op.add_column("import_message_occurrences", sa.Column("timestamp_precision", sa.String(length=10), nullable=True))
    connection.execute(
        sa.text(
            """
            UPDATE import_message_occurrences
            SET timestamp_precision = COALESCE(
                (SELECT timestamp_precision FROM raw_messages
                 WHERE raw_messages.id = import_message_occurrences.raw_message_id),
                'minute'
            )
            """
        )
    )
    with op.batch_alter_table("import_message_occurrences") as batch:
        batch.alter_column("timestamp_precision", existing_type=sa.String(length=10), nullable=False)


def downgrade() -> None:
    # Corrected 0002 already includes this column; preserve that schema and data.
    pass
