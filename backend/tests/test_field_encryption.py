"""Field-level encryption roundtrip on the FhirConnector model."""

from __future__ import annotations

import pytest
from sqlalchemy import select, text

from app.db.session import control_session
from app.models.tables import FhirConnector, Tenant


pytestmark = pytest.mark.anyio("asyncio")


async def test_fhir_connector_secret_is_encrypted_at_rest(fastapi_app):
    """Insert via the ORM; the raw column value must NOT equal the plaintext."""
    plaintext = "extremely-sensitive-fhir-secret-xyz"

    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == "prominencehealth"))
        assert tenant
        # Clean up any prior record from a previous run for idempotency.
        prior = await session.scalar(
            select(FhirConnector).where(FhirConnector.tenant_id == tenant.id, FhirConnector.base_url == "https://fhir.test/r4")
        )
        if prior:
            await session.delete(prior)
            await session.commit()

        connector = FhirConnector(
            tenant_id=tenant.id,
            base_url="https://fhir.test/r4",
            client_id="client-abc",
            client_secret=plaintext,
        )
        session.add(connector)
        await session.commit()
        connector_id = connector.id

    # Read via ORM: should return decrypted plaintext.
    async with control_session() as session:
        loaded = await session.get(FhirConnector, connector_id)
        assert loaded is not None
        assert loaded.client_secret == plaintext

    # Read raw column bytes: must be ciphertext, not plaintext.
    async with control_session() as session:
        raw = await session.scalar(
            text("SELECT client_secret FROM fhir_connectors WHERE id = :id").bindparams(id=connector_id)
        )
        assert raw is not None
        assert raw != plaintext, "client_secret stored as plaintext"
        assert raw.startswith("gAAAAA"), f"expected Fernet token, got {raw[:12]!r}"
