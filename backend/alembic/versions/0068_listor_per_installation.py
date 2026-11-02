"""Listor per installation och portalens namn.

Kolumnen ea_org_settings.app_name: NULL betyder standardnamnet.

Kolumnen ea_org_settings.domain_lists: NULL betyder alla inbyggda listor och
inga egna, så en befintlig installation ser likadan ut efter uppgraderingen.

Standardtilldelningarna (alla läser, superanvändare förvaltar) får också den nya
objekttypen, annars skulle bara administratörer se egna listor. En tilldelning
en administratör har smalnat av lämnas som den är.
"""
from __future__ import annotations

from alembic import op

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None

OPPNA = (
    '["Process", "Application", "InformationObject", "InformationSource", '
    '"TechnologyComponent", "ArchitecturePrinciple"]'
)


def upgrade() -> None:
    op.execute("ALTER TABLE ea_org_settings ADD COLUMN IF NOT EXISTS domain_lists JSONB")
    op.execute("ALTER TABLE ea_org_settings ADD COLUMN IF NOT EXISTS app_name VARCHAR(100)")
    op.execute(
        f"""
        UPDATE ea_access_grants
           SET node_types = node_types || '["CustomObject"]'::jsonb
         WHERE scope_type = 'types'
           AND node_types @> '{OPPNA}'::jsonb
           AND NOT node_types @> '["CustomObject"]'::jsonb
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE ea_org_settings DROP COLUMN IF EXISTS domain_lists")
    op.execute("ALTER TABLE ea_org_settings DROP COLUMN IF EXISTS app_name")
    op.execute(
        "UPDATE ea_access_grants SET node_types = node_types - 'CustomObject' "
        "WHERE node_types @> '[\"CustomObject\"]'::jsonb"
    )
