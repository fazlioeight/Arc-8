from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import DocsArticle as DocsArticleModel
from ..schemas.docs import DocsArticle, DocsArticleCreate, DocsArticleListResponse
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user, require_admin, require_application

router = APIRouter(
    prefix="/api/docs",
    tags=["docs"],
    dependencies=[Depends(require_application("docs"))],
)

DEFAULT_DOCS_MANUAL_ARTICLES: tuple[dict, ...] = (
    {
        "title": "Arc-8 Member 360 & Care Coordinator User Manual (v2.0)",
        "summary": "Complete clinical operations guide covering Care Intelligence KPIs, Patient Roster filters, Member 360 Cockpit 8 tabs, SBAR Tasks, Care Journeys, and Guided In-Call Triage.",
        "content": (
            "1. CARE INTELLIGENCE & PATIENT ROSTER (F-01..F-07): View operational KPI tiles, high-priority members, "
            "4-domain risk drivers, and filter the member roster by risk tier, active journeys, or open tasks.\n"
            "2. MEMBER 360 COCKPIT (F-08..F-20): Unified longitudinal timeline, AI call summaries with @mentions, "
            "Care Journey stages, HEDIS & CMS HCC v28 Care Gaps, Medications (0-refill/PA alerts) & Labs, "
            "Claims & Deductible/MOOP progress bars, Member Documents with 1-click PDF email, and HIPAA Audit Log.\n"
            "3. CLINICAL TASKS & CARE JOURNEYS (F-22..F-26): SBAR task creation, supervisor escalation queues, "
            "and templated clinical care pathways."
        ),
        "app_key": "member360",
        "tags": ["manual", "pdf", "member360", "care-coordinator", "training"],
        "status": "published",
    },
    {
        "title": "VBC Risk Adjustment Coding Worklist & Suspect Workbench Guide",
        "summary": "Standard operating procedures for CPC/CRC coders reviewing HCC v28 suspects, MEAT criteria validation, chase queues, and RAF analytics (1.25 target).",
        "content": (
            "1. CODING WORKLIST (F-32..F-33): Filter chases by status, priority, due date, and assigned coder.\n"
            "2. SUSPECT WORKBENCH (F-34): Inspect chart evidence snippets, map ICD-10 to CMS HCC v28, and complete "
            "all four M.E.A.T. (Monitored, Evaluated, Assessed, Treated) criteria to finalize.\n"
            "3. RAF & CODING ANALYTICS (F-35): Track realized RAF against the calibrated 1.25 MA target and review "
            "the suspect-to-recapture conversion funnel."
        ),
        "app_key": "coding",
        "tags": ["coding", "hcc-v28", "meat", "raf", "manual"],
        "status": "published",
    },
    {
        "title": "17-Feed UHS SFTP Data Ingestion & 6 Live Client API Connectors Guide",
        "summary": "Technical reference for the 17-feed UHS SFTP parser, 30-Day Redis Hot Cache, and live API integrations (QNXT, Talkdesk, Enterprise SSO, Abarca PBM, CareAdvance, Labs/Titan/GL).",
        "content": (
            "1. 30-DAY REDIS HOT CACHE (FR-DAT-02): Caches Member 360 and live API responses for 30 days (2,592,000s) "
            "with automatic write-through invalidation for <500ms member search and <2s cockpit load.\n"
            "2. LIVE API CONNECTORS (G-08): QNXT (Eligibility, Claims, Accumulators, MPI), Talkdesk CTI Webhook & AI "
            "Call Summary, Enterprise OIDC/SAML SSO (12-Role RBAC), Abarca PBM (Rx, 0-Refills, Prior Auths), "
            "CareAdvance Two-Way Journey Sync, Clinical Labs, Project Titan MRA, and Clarity/GL Finance APIs."
        ),
        "app_key": "job_center",
        "tags": ["apis", "qnxt", "talkdesk", "abarca", "careadvance", "redis", "sftp"],
        "status": "published",
    },
)


async def _ensure_default_manual_articles(session: AsyncSession, tenant_id: int) -> None:
    """G-14: Ensure the Docs Library is pre-populated with the Arc-8 User Manual articles."""
    count = await session.scalar(
        select(func.count())
        .select_from(DocsArticleModel)
        .where(DocsArticleModel.tenant_id == tenant_id)
    )
    if (count or 0) > 0:
        return
    for item in DEFAULT_DOCS_MANUAL_ARTICLES:
        session.add(
            DocsArticleModel(
                tenant_id=tenant_id,
                title=item["title"],
                summary=item["summary"],
                content=item["content"],
                app_key=item["app_key"],
                tags=item["tags"],
                status=item["status"],
                created_by="system@prominencehealth.com",
            )
        )
    await session.commit()


def _to_article(row: DocsArticleModel) -> DocsArticle:
    return DocsArticle(
        id=row.id,
        title=row.title,
        summary=row.summary,
        content=row.content,
        app_key=row.app_key,
        tags=list(row.tags or []),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/articles", response_model=DocsArticleListResponse)
async def list_articles(
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DocsArticleListResponse:
    await _ensure_default_manual_articles(session, tenant.id)
    filters = [
        DocsArticleModel.tenant_id == tenant.id,
        DocsArticleModel.status == "published",
    ]
    if q:
        like = f"%{q.lower()}%"
        filters.append(
            or_(
                func.lower(DocsArticleModel.title).like(like),
                func.lower(DocsArticleModel.summary).like(like),
                func.lower(DocsArticleModel.content).like(like),
            )
        )

    total_stmt = select(func.count()).select_from(DocsArticleModel).where(*filters)
    stmt = (
        select(DocsArticleModel)
        .where(*filters)
        .order_by(DocsArticleModel.updated_at.desc(), DocsArticleModel.title.asc())
        .limit(limit)
    )
    total = int(await session.scalar(total_stmt) or 0)
    rows = list((await session.scalars(stmt)).all())
    return DocsArticleListResponse(articles=[_to_article(row) for row in rows], total=total)


@router.get("/manual.pdf")
async def download_user_manual_pdf(
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Response:
    """G-14: Serve the existing PDF manual from docs/ (or synthesize a valid PDF fallback)."""
    repo_root = Path(__file__).resolve().parents[3]
    pdf_candidates = [
        repo_root / "docs" / "functional-req-doc-v2-17-11-2026.pdf",
    ]
    for candidate in pdf_candidates:
        if candidate.is_file():
            return Response(
                content=candidate.read_bytes(),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": 'attachment; filename="Arc-8_User_Manual_v2.pdf"',
                },
            )
    fallback_pdf = (
        b"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj\n"
        b"trailer<< /Root 1 0 R >>\n%%EOF\n"
    )
    return Response(
        content=fallback_pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Arc-8_User_Manual_v2.pdf"'},
    )


@router.post("/articles", response_model=DocsArticle, status_code=status.HTTP_201_CREATED)
async def create_article(
    payload: DocsArticleCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> DocsArticle:
    article = DocsArticleModel(
        tenant_id=tenant.id,
        title=payload.title,
        summary=payload.summary,
        content=payload.content,
        app_key=payload.app_key,
        tags=payload.tags,
        status=payload.status,
        created_by=current_user.email,
    )
    session.add(article)
    await session.flush()
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="docs.article.create",
        payload={"article_id": article.id, "title": article.title},
    )
    await session.commit()
    await session.refresh(article)
    return _to_article(article)
