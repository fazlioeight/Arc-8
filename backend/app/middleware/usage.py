from __future__ import annotations

"""Backward-compatible import for the legacy UsageMiddleware."""

from .rate_limit import RateLimitMiddleware as UsageMiddleware

__all__ = ["UsageMiddleware"]
