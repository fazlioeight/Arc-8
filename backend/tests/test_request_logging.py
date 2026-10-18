"""Path-scrubbing in the request logging middleware."""

from __future__ import annotations

from app.middleware.request_logging import scrub_path


def test_scrubs_numeric_ids() -> None:
    assert scrub_path("/api/admin/users/123") == "/api/admin/users/:id"
    assert scrub_path("/api/member360/members/42/notes") == "/api/member360/members/:id/notes"


def test_scrubs_long_opaque_segments() -> None:
    assert scrub_path("/api/coding/members/MBR-9F8A7B6C-XYZ-LONG") == "/api/coding/members/:id"


def test_leaves_short_route_segments_alone() -> None:
    # Route shape should still be readable in logs.
    assert scrub_path("/api/portal/overview") == "/api/portal/overview"
    assert scrub_path("/api/auth/mfa/enroll") == "/api/auth/mfa/enroll"


def test_handles_trailing_slash() -> None:
    assert scrub_path("/api/admin/users/123/") == "/api/admin/users/:id/"
