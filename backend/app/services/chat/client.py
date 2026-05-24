from __future__ import annotations

from typing import Optional

from anthropic import AsyncAnthropic

from ...core.config import settings


ALLOWED_MODELS: dict[str, dict] = {
    "claude-haiku-4-5-20251001": {"label": "Haiku 4.5  — fast", "max_tokens": 64_000},
    "claude-sonnet-4-6":         {"label": "Sonnet 4.6 — balanced", "max_tokens": 64_000},
    "claude-opus-4-7":           {"label": "Opus 4.7   — most capable", "max_tokens": 128_000},
}

# Non-streaming requests must finish within the SDK's 10-minute timeout, or
# the client refuses to send them ("Streaming is required for operations that
# may take longer than 10 minutes."). Chat replies almost never exceed a few
# thousand tokens, so cap non-streaming calls well below the guardrail.
NON_STREAMING_MAX_TOKENS = 8_192


def resolve_model(requested: Optional[str]) -> str:
    if requested and requested in ALLOWED_MODELS:
        return requested
    return settings.CLAUDE_MODEL


def max_tokens(model_id: str, *, streaming: bool = False) -> int:
    if not streaming:
        return NON_STREAMING_MAX_TOKENS
    return ALLOWED_MODELS.get(model_id, {}).get("max_tokens", 64_000)


_client: Optional[AsyncAnthropic] = None


def get_client() -> Optional[AsyncAnthropic]:
    global _client
    if _client is not None:
        return _client
    if not settings.ANTHROPIC_API_KEY:
        return None
    _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client
