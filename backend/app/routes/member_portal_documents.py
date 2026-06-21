"""Member-facing document download — EOBs & plan documents (Feature 4).

Mounted at ``/api/member/documents``. Two-step, defense-in-depth flow:

  1. ``GET  /``                 list the member's own documents (metadata only —
                                never the storage key/path).
  2. ``POST /{id}/grant``       (member session) re-verify ownership, mint a
                                SHORT-LIVED signed capability token, return a
                                relative download URL carrying it.
  3. ``GET  /access?token=..``  validate the signed token, RE-VERIFY ownership
                                server-side, stream the bytes, audit the read.

Security properties:
  * No public/durable URLs and no raw object keys are ever exposed; the client
    only sees opaque document ids and a ~2-minute signed token.
  * Ownership is checked at grant time AND again at stream time (no IDOR, even
    if a token is replayed for a doc that was since reassigned/removed).
  * The capability token is a JWT (``typ=mdl``) signed with the platform key and
    bound to tenant + account + document; it is not PHI.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..middleware.rate_limit import member_phi_rate_limit
from ..models.member_portal import MemberPortalAccount
from ..schemas.member_portal import DocumentGrantResponse, DocumentListResponse, DocumentOut
from ..services import member_portal_data
from ..services.member360_storage import DocumentStorageError, get_document_backend
from ..utils.member_auth import AuthenticatedMember, get_current_member
from ..utils.phi_audit import PhiAction, PhiEvent, record_phi_access
from ..utils.security import create_access_token, decode_token
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/member/documents", tags=["member-portal"])
logger = logging.getLogger(__name__)

_GRANT_TOKEN_TYPE = "mdl"  # member document link


def _safe_header_filename(name: str) -> str:
    # Strip CR/LF and quotes to prevent response-header injection.
    return (name or "document").replace("\r", "").replace("\n", "").replace('"', "")


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
    _rl: None = Depends(member_phi_rate_limit()),
) -> DocumentListResponse:
    member = await member_portal_data.get_member_by_key(session, current_member.member_key)
    record_phi_access(
        request, event=PhiEvent.ACCESS, user_id=current_member.email,
        patient_id=current_member.member_key, record_type="documents",
        action=PhiAction.READ, success=member is not None,
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member record not found")
    docs = await member_portal_data.list_documents(session, member.id)
    return DocumentListResponse(items=[DocumentOut.model_validate(d) for d in docs])


@router.post("/{document_id}/grant", response_model=DocumentGrantResponse)
async def grant_download(
    document_id: int,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
    _rl: None = Depends(member_phi_rate_limit()),
) -> DocumentGrantResponse:
    member = await member_portal_data.get_member_by_key(session, current_member.member_key)
    document = (
        await member_portal_data.get_document_for_member(session, member.id, document_id)
        if member
        else None
    )
    if document is None:
        # Unknown doc or someone else's — same 404 (no IDOR signal).
        record_phi_access(
            request, event=PhiEvent.ACCESS, user_id=current_member.email,
            patient_id=current_member.member_key, record_type="document_grant",
            action=PhiAction.READ, success=False,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    token = create_access_token(
        {
            "typ": _GRANT_TOKEN_TYPE,
            "tid": tenant.key,
            "mid": current_member.id,
            "did": document.id,
        },
        expires_delta=timedelta(seconds=settings.MEMBER_DOC_GRANT_TTL_SECONDS),
    )
    return DocumentGrantResponse(
        download_url=f"/api/member/documents/access?token={token}",
        expires_in=settings.MEMBER_DOC_GRANT_TTL_SECONDS,
    )


@router.get("/access")
async def access_document(
    request: Request,
    token: str,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control: AsyncSession = Depends(get_control_session),
) -> Response:
    """Stream a document for a valid, unexpired capability token.

    No ``Authorization`` header required — the signed token IS the capability,
    so a browser can follow the link directly. Tenant still comes from the
    request (header/subdomain), and ownership is re-verified here.
    """
    invalid = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired download link")
    payload = decode_token(token)  # raises 401 on expiry/signature failure
    if payload.get("typ") != _GRANT_TOKEN_TYPE or payload.get("tid") != tenant.key:
        raise invalid
    account_id = payload.get("mid")
    document_id = payload.get("did")
    if not account_id or not document_id:
        raise invalid

    account = await control.get(MemberPortalAccount, account_id)
    if account is None or account.tenant_id != tenant.id or account.status != "active":
        raise invalid

    member = await member_portal_data.get_member_by_key(session, account.member_key)
    document = (
        await member_portal_data.get_document_for_member(session, member.id, document_id)
        if member
        else None
    )
    if document is None:
        record_phi_access(
            request, event=PhiEvent.ACCESS, user_id=account.email,
            patient_id=account.member_key, record_type="document", action=PhiAction.READ, success=False,
        )
        raise invalid

    if not document.storage_path or not document.storage_backend:
        # Generated-on-demand documents (no stored object) aren't wired yet.
        record_phi_access(
            request, event=PhiEvent.ACCESS, user_id=account.email,
            patient_id=account.member_key, record_type="document", action=PhiAction.READ, success=False,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document content is not available")

    backend = get_document_backend()
    try:
        body = await backend.read(tenant_key=tenant.key, storage_path=document.storage_path)
    except DocumentStorageError:
        record_phi_access(
            request, event=PhiEvent.ACCESS, user_id=account.email,
            patient_id=account.member_key, record_type="document", action=PhiAction.READ, success=False,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document content is not available")

    record_phi_access(
        request, event=PhiEvent.ACCESS, user_id=account.email,
        patient_id=account.member_key, record_type="document", action=PhiAction.READ, success=True,
    )
    filename = _safe_header_filename(document.file_name)
    return Response(
        content=body,
        media_type=document.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
