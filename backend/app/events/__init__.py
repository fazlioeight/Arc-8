"""Domain event publishing primitives.

This package is the seam between Postgres-resident truth and the AI semantic
layer (Cosmos DB + Azure AI Search + Azure OpenAI). The transactional outbox
in ``outbox.py`` is the durability guarantee — a domain mutation and its event
are committed in the same SQL transaction, so no event can be lost between
the operational store and the event bus.
"""
