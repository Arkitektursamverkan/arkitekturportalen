"""Verksamhetskalendern som synkmål: händelsens källa.

En händelse som en synkronisering håller efter bär källans etikett och postens
id, så att nästa körning hittar samma händelse igen. Tomt på händelser som
skapats i portalen.
"""
from __future__ import annotations

from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE ea_calendar_events ADD COLUMN IF NOT EXISTS external_source VARCHAR(50)")
    op.execute("ALTER TABLE ea_calendar_events ADD COLUMN IF NOT EXISTS external_id VARCHAR(400)")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_ea_calendar_events_external
            ON ea_calendar_events (external_source, external_id)
         WHERE external_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_ea_calendar_events_external")
    op.execute("ALTER TABLE ea_calendar_events DROP COLUMN IF EXISTS external_id")
    op.execute("ALTER TABLE ea_calendar_events DROP COLUMN IF EXISTS external_source")
