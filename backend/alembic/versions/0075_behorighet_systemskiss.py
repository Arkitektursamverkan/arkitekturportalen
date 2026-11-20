"""Behörigheten sketches.read (se objektets systemskisser).

Systemskisserna på en server visades för alla som fick se servern. Nu krävs
en egen behörighet, som delas ut under Behörigheter. Rollen Förvaltare får
den, så att de som redan förvaltar servrar ser skisserna som förut; övriga
roller rörs inte.
"""
from __future__ import annotations

from alembic import op

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE ea_roles
           SET permissions = permissions || '["sketches.read"]'::jsonb
         WHERE key = 'forvaltare' AND NOT permissions ? 'sketches.read'
        """
    )


def downgrade() -> None:
    op.execute("UPDATE ea_roles SET permissions = permissions - 'sketches.read'")
