"""Add auto-summary and auto-naming columns to chats

Revision ID: 003_chat_summary_and_naming
Revises: 002_excerpt_text
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_chat_summary_and_naming'
down_revision: Union[str, None] = '002_excerpt_text'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chats', sa.Column('user_edited_title', sa.String(length=255), nullable=True))
    op.add_column('chats', sa.Column('generated_title', sa.String(length=255), nullable=True))
    op.add_column('chats', sa.Column('generated_summary', sa.Text(), nullable=True))
    op.add_column('chats', sa.Column('summary_status', sa.String(length=20), server_default='pending', nullable=False))


def downgrade() -> None:
    op.drop_column('chats', 'user_edited_title')
    op.drop_column('chats', 'generated_title')
    op.drop_column('chats', 'generated_summary')
    op.drop_column('chats', 'summary_status')
