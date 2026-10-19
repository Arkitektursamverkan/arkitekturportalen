"""Samma schema för alla installationer.

Tre skillnader rättas, så att en ny installation och en befintlig slutar på
exakt samma schema. Varje steg gör inget där det redan är på plats.

1. Indexen som modellerna har men de tidigare migreringarna aldrig skapade
   (sökning på objektnamn, relationer per källa/mål och typ).
2. Ett CHECK-villkor på kommentarernas ämnestyp som bara tillät principer och
   målarkitektur – kommentarer på ordlistan, nulägesanalysen och GAP-analysen
   avvisades. Appen kontrollerar ämnestypen (CommentSubjectType), så villkoret
   tas bort.
3. En installation vars tabeller en gång skapades direkt från modellerna
   (till exempel efter en återställning) saknar standardvärden och
   CHECK-villkor som migreringarna lade till, och har ett annat namn på
   e-postens unika villkor.

Revision ID: 0067
Revises: 0066
Create Date: 2026-10-19
"""
from __future__ import annotations

from alembic import op

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None

INDEX = [
    ("ix_ea_nodes_name", "ea_nodes", "name"),
    ("ix_ea_edges_source_type", "ea_edges", "source_id, type"),
    ("ix_ea_edges_target_type", "ea_edges", "target_id, type"),
]

STANDARDVARDEN = [
    ("ea_audit_log", "restored", "false"),
    ("ea_document_metadata", "entries", "'[]'::jsonb"),
    ("ea_document_version", "audit_entries", "'[]'::jsonb"),
    ("ea_document_version", "is_major", "false"),
    ("ea_document_version", "version_major", "0"),
    ("ea_document_version", "version_minor", "1"),
    ("ea_edges", "attributes", "'{}'::jsonb"),
    ("ea_home_banners", "body", "''"),
    ("ea_home_blocks", "body", "''"),
    ("ea_nodes", "archived", "false"),
    ("ea_nodes", "attributes", "'{}'::jsonb"),
    ("ea_nodes", "external_source", "'NONE'"),
    ("ea_principle_document", "sections", "'{}'::jsonb"),
    ("ea_users", "role", "'user'"),
]

VILLKOR = [
    ("ea_comments", "ck_ea_comments_status", "status IN ('pending', 'approved', 'rejected')"),
    (
        "ea_solution_sketches",
        "ck_ea_solution_sketches_status",
        "status IN ('draft', 'in_review', 'approved', 'archived')",
    ),
    ("ea_users", "ck_ea_users_role", "role IN ('user', 'superuser', 'admin')"),
]


def upgrade() -> None:
    for namn, tabell, kolumner in INDEX:
        op.execute(f"CREATE INDEX IF NOT EXISTS {namn} ON {tabell} ({kolumner})")

    op.execute("ALTER TABLE ea_comments DROP CONSTRAINT IF EXISTS ck_ea_comments_subject_type")

    for tabell, kolumn, varde in STANDARDVARDEN:
        op.execute(f"ALTER TABLE {tabell} ALTER COLUMN {kolumn} SET DEFAULT {varde}")

    for tabell, namn, uttryck in VILLKOR:
        op.execute(
            f"""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{namn}') THEN
                    ALTER TABLE {tabell} ADD CONSTRAINT {namn} CHECK ({uttryck});
                END IF;
            END $$
            """
        )

    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ea_users_email_key')
               AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ea_users_email') THEN
                ALTER TABLE ea_users RENAME CONSTRAINT ea_users_email_key TO uq_ea_users_email;
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    for namn, _tabell, _kolumner in INDEX:
        op.execute(f"DROP INDEX IF EXISTS {namn}")
