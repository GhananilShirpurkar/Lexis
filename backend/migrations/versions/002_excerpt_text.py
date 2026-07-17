"""Update citation excerpt column to Text

Revision ID: 002_excerpt_text
Revises: 001_initial
Create Date: 2026-07-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_excerpt_text'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'citations',
        'excerpt',
        existing_type=sa.VARCHAR(length=200),
        type_=sa.Text(),
        existing_nullable=False
    )


def downgrade() -> None:
    op.alter_column(
        'citations',
        'excerpt',
        existing_type=sa.Text(),
        type_=sa.VARCHAR(length=200),
        existing_nullable=False
    )
