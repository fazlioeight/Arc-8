-- Tenant-side PostgreSQL functions for Member360.
-- Applied idempotently on tenant provisioning and once per process per
-- tenant via _bootstrap_tenant_schema() in app.db.tenant_manager.
--
-- All functions are tenant-scoped: they read tables in the tenant DB and
-- never reference the control plane. They short-circuit cleanly on SQLite
-- (used in tests) because the dialect detection in the service layer skips
-- applying them when the bind is not Postgres.

-- ---------------------------------------------------------------------------
-- Member rollup counters
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_m360_open_task_counts(p_member_ids INT[])
RETURNS TABLE(member_id INT, open_count BIGINT) AS $$
    SELECT t.member_id, COUNT(t.id)
    FROM m360_tasks t
    WHERE t.member_id = ANY(p_member_ids)
      AND t.status IN ('open', 'in_progress', 'waiting')
    GROUP BY t.member_id;
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE FUNCTION fn_m360_active_journey_counts(p_member_ids INT[])
RETURNS TABLE(member_id INT, active_count BIGINT) AS $$
    SELECT j.member_id, COUNT(j.id)
    FROM m360_care_journeys j
    WHERE j.member_id = ANY(p_member_ids)
      AND j.status IN ('active', 'paused')
    GROUP BY j.member_id;
$$ LANGUAGE sql STABLE;


-- ---------------------------------------------------------------------------
-- Dashboard rollup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_m360_dashboard_metrics()
RETURNS TABLE(
    total_members BIGINT,
    high_risk BIGINT,
    critical_risk BIGINT,
    open_tasks BIGINT,
    overdue_tasks BIGINT,
    active_journeys BIGINT,
    estimated_savings NUMERIC,
    validated_savings NUMERIC
) AS $$
    SELECT
        (SELECT COUNT(*) FROM m360_members),
        (SELECT COUNT(*) FROM m360_members WHERE risk_tier = 'High'),
        (SELECT COUNT(*) FROM m360_members WHERE risk_tier = 'Critical'),
        (SELECT COUNT(*) FROM m360_tasks WHERE status IN ('open', 'in_progress', 'waiting')),
        (SELECT COUNT(*) FROM m360_tasks WHERE status IN ('open', 'in_progress', 'waiting') AND due_date < CURRENT_DATE),
        (SELECT COUNT(*) FROM m360_care_journeys WHERE status = 'active'),
        COALESCE((SELECT SUM(estimated_savings) FROM m360_savings), 0),
        COALESCE((SELECT SUM(estimated_savings) FROM m360_savings WHERE savings_validated = TRUE), 0);
$$ LANGUAGE sql STABLE;


-- ---------------------------------------------------------------------------
-- Top risk drivers (used by dashboard)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_m360_top_risk_drivers(p_limit INT DEFAULT 5)
RETURNS TABLE(
    domain VARCHAR,
    driver VARCHAR,
    member_count BIGINT,
    average_score NUMERIC
) AS $$
    SELECT
        ri.domain,
        COALESCE(ri.driver, 'Unspecified'),
        COUNT(ri.id),
        AVG(ri.score)
    FROM m360_risk_insights ri
    GROUP BY ri.domain, ri.driver
    ORDER BY AVG(ri.score) DESC
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;


-- ---------------------------------------------------------------------------
-- Per-member summary (counts + last interaction)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_m360_member_summary(p_member_id INT)
RETURNS TABLE(
    member_id INT,
    open_task_count BIGINT,
    active_journey_count BIGINT,
    open_care_gaps INT,
    last_interaction_at TIMESTAMP,
    composite_risk NUMERIC,
    risk_tier VARCHAR
) AS $$
    SELECT
        m.id,
        COALESCE((SELECT COUNT(*) FROM m360_tasks t WHERE t.member_id = m.id AND t.status IN ('open', 'in_progress', 'waiting')), 0),
        COALESCE((SELECT COUNT(*) FROM m360_care_journeys j WHERE j.member_id = m.id AND j.status IN ('active', 'paused')), 0),
        m.open_care_gaps,
        m.last_interaction_at,
        m.risk_score_composite,
        m.risk_tier
    FROM m360_members m
    WHERE m.id = p_member_id;
$$ LANGUAGE sql STABLE;


-- ---------------------------------------------------------------------------
-- Gap analysis snapshot — surfaces high-impact risk insights as missing HCCs.
-- This is a thin wrapper around m360_risk_insights so other reports can
-- materialise the same view as the Python service.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_m360_gap_candidates(p_member_id INT, p_min_score NUMERIC DEFAULT 6.0)
RETURNS TABLE(
    domain VARCHAR,
    driver VARCHAR,
    score NUMERIC,
    recommendation VARCHAR,
    confidence NUMERIC
) AS $$
    SELECT
        ri.domain,
        ri.driver,
        ri.score,
        ri.recommendation,
        ri.confidence
    FROM m360_risk_insights ri
    WHERE ri.member_id = p_member_id
      AND ri.score >= p_min_score
    ORDER BY ri.score DESC;
$$ LANGUAGE sql STABLE;


-- ---------------------------------------------------------------------------
-- Care coordination worklist — used by the lab tasks page to fetch all open
-- tasks across members with the member metadata pre-joined.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_m360_worklist(p_priority TEXT DEFAULT NULL, p_assigned_user TEXT DEFAULT NULL)
RETURNS TABLE(
    task_id INT,
    member_id INT,
    member_key VARCHAR,
    member_name TEXT,
    risk_tier VARCHAR,
    priority VARCHAR,
    status VARCHAR,
    title VARCHAR,
    due_date DATE,
    assigned_user VARCHAR,
    assigned_queue VARCHAR
) AS $$
    SELECT
        t.id,
        t.member_id,
        m.member_key,
        TRIM(CONCAT_WS(' ', m.first_name, m.last_name)),
        m.risk_tier,
        t.priority,
        t.status,
        t.title,
        t.due_date,
        t.assigned_user,
        t.assigned_queue
    FROM m360_tasks t
    JOIN m360_members m ON m.id = t.member_id
    WHERE (p_priority IS NULL OR t.priority = p_priority)
      AND (p_assigned_user IS NULL OR t.assigned_user = p_assigned_user)
      AND t.status IN ('open', 'in_progress', 'waiting')
    ORDER BY
        CASE t.priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
        END,
        t.due_date NULLS LAST,
        t.id;
$$ LANGUAGE sql STABLE;
