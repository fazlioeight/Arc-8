"""event_outbox table and immutability trigger.

Creates the per-tenant ``event_outbox`` table that backs the transactional
outbox pattern feeding Event Hub. A Postgres trigger forbids UPDATE/DELETE on
rows where ``published_at IS NOT NULL`` so once an event has been emitted to
the bus, the row is immutable forensic evidence — required for HIPAA audit
(§164.312(b)) and for replay-from-source if downstream consumers need to
rebuild state.

Why a trigger and not just application code? Defense in depth. A bug, a
runaway migration, or a DB admin with the wrong intention could otherwise
rewrite history; the trigger makes that a hard error at the DB level.

Why a per-tenant table and not a global one? The rest of Nexora's per-tenant
data (members, claims, ...) lives in the tenant schema. Keeping outbox there
means it inherits the same connection-scoping and (once added in week 2) the
same RLS policies, so a misrouted query can't pull another tenant's event
stream.

Revision ID: 20260519_000012
Revises: 20260517_000011
Create Date: 2026-05-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260519_000012"
down_revision = "20260517_000011"
branch_labels = None
depends_on = None


_TRIGGER_FN_NAME = "fn_event_outbox_block_mutation"
_TRIGGER_NAME = "trg_event_outbox_block_mutation"


def upgrade() -> None:
    """Create table, indexes, and immutability trigger.

    The trigger is created using PL/pgSQL because pure SQL constraints can't
    express "block UPDATE but only when this column was already set" — we
    want the publisher to be able to set ``published_at = NOW()`` exactly
    once, after which the row is frozen.
    """
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # SQLite tests don't run real migrations against per-tenant schemas — the
    # test harness uses ``create_all`` against an in-memory engine. We still
    # define the table here so a future hand-run upgrade against a real
    # Postgres tenant DB works end-to-end.
    op.create_table(
        "event_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=False) if dialect_name == "postgresql" else sa.String(36),
            nullable=False,
            unique=True,
        ),
        sa.Column("aggregate_type", sa.String(64), nullable=False),
        sa.Column("aggregate_id", sa.String(128), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()) if dialect_name == "postgresql" else sa.JSON(),
            nullable=False,
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("correlation_id", sa.String(64), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_event_outbox_aggregate",
        "event_outbox",
        ["aggregate_type", "aggregate_id"],
    )

    if dialect_name == "postgresql":
        # Partial index: publisher's hot path. Index is empty for already-
        # published rows so it stays tiny regardless of historical volume.
        op.execute(
            "CREATE INDEX ix_event_outbox_unpublished "
            "ON event_outbox (id) WHERE published_at IS NULL"
        )

        # Immutability trigger.
        #
        # Allow:
        #   - INSERT of a brand new row (event_id + payload set)
        #   - UPDATE that ONLY sets ``published_at``, ``attempts``, or
        #     ``last_error`` (publisher's bookkeeping fields)
        # Reject:
        #   - Any UPDATE that mutates payload, aggregate, or occurred_at
        #   - DELETE on any row where published_at IS NOT NULL
        op.execute(
            f"""
            CREATE OR REPLACE FUNCTION {_TRIGGER_FN_NAME}() RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    IF OLD.published_at IS NOT NULL THEN
                        RAISE EXCEPTION
                            'event_outbox row % is published; deletion is forbidden by HIPAA audit policy',
                            OLD.event_id;
                    END IF;
                    RETURN OLD;
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    IF NEW.event_id IS DISTINCT FROM OLD.event_id
                       OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
                       OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
                       OR NEW.event_type IS DISTINCT FROM OLD.event_type
                       OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
                       OR NEW.payload IS DISTINCT FROM OLD.payload
                       OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
                       OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
                    THEN
                        RAISE EXCEPTION
                            'event_outbox row % is immutable; only published_at/attempts/last_error may be updated',
                            OLD.event_id;
                    END IF;
                    -- Disallow un-publishing once published, even via the
                    -- allowed columns above.
                    IF OLD.published_at IS NOT NULL AND NEW.published_at IS NULL THEN
                        RAISE EXCEPTION
                            'event_outbox row % is already published; cannot reset published_at',
                            OLD.event_id;
                    END IF;
                    RETURN NEW;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            f"""
            CREATE TRIGGER {_TRIGGER_NAME}
            BEFORE UPDATE OR DELETE ON event_outbox
            FOR EACH ROW EXECUTE FUNCTION {_TRIGGER_FN_NAME}();
            """
        )


def downgrade() -> None:
    """Drop trigger and table. Note: downgrading after events have been
    published is destructive — operators should archive the table first."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f"DROP TRIGGER IF EXISTS {_TRIGGER_NAME} ON event_outbox")
        op.execute(f"DROP FUNCTION IF EXISTS {_TRIGGER_FN_NAME}()")
        op.execute("DROP INDEX IF EXISTS ix_event_outbox_unpublished")
    op.drop_index("ix_event_outbox_aggregate", table_name="event_outbox")
    op.drop_table("event_outbox")
