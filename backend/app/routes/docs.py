from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
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
