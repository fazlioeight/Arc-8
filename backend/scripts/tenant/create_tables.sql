-- Per-tenant (TenantDataBase) tables.
-- Run within each tenant schema/database when a new tenant is provisioned.

-- ─────────────────────────────────────────────
-- Generic member / claims (legacy)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS members (
    id         INTEGER      PRIMARY KEY,
    member_key VARCHAR(64)  NOT NULL,
    name       VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS ix_members_member_key ON members(member_key);

CREATE TABLE IF NOT EXISTS claims (
    id           INTEGER        PRIMARY KEY,
    member_key   VARCHAR(64)    NOT NULL,
    service_date DATE,
    cost         NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_claims_member_key ON claims(member_key);

-- ─────────────────────────────────────────────
-- Coding domain — providers
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coding_providers (
    id     INTEGER      PRIMARY KEY,
    npi    VARCHAR(15)  UNIQUE,
    tax_id VARCHAR(15),
    name   VARCHAR(128) NOT NULL,
    phone  VARCHAR(20),
    email  VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS ix_coding_providers_npi ON coding_providers(npi);

CREATE TABLE IF NOT EXISTS coding_provider_locations (
    id            INTEGER     PRIMARY KEY,
    provider_id   INTEGER     NOT NULL UNIQUE REFERENCES coding_providers(id) ON DELETE CASCADE,
    address_line1 VARCHAR(120),
    city          VARCHAR(64),
    state         VARCHAR(2),
    postal_code   VARCHAR(10)
);

-- ─────────────────────────────────────────────
-- Coding domain — members
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coding_members (
    id                INTEGER        PRIMARY KEY,
    member_key        VARCHAR(64)    NOT NULL UNIQUE,
    first_name        VARCHAR(80),
    last_name         VARCHAR(80),
    date_of_birth     DATE,
    gender            VARCHAR(1),
    status            VARCHAR(32)    NOT NULL DEFAULT 'active',
    line_of_business  VARCHAR(32),
    primary_language  VARCHAR(64),
    risk_score        NUMERIC(6, 2),
    pcp_name          VARCHAR(128),
    pcp_npi           VARCHAR(15),
    last_contacted_at TIMESTAMP,
    address_city      VARCHAR(64),
    address_state     VARCHAR(2),
    address_zip       VARCHAR(10)
);

CREATE INDEX IF NOT EXISTS ix_coding_members_member_key ON coding_members(member_key);

CREATE TABLE IF NOT EXISTS coding_member_eligibility (
    id                     INTEGER  PRIMARY KEY,
    member_id              INTEGER  NOT NULL UNIQUE REFERENCES coding_members(id) ON DELETE CASCADE,
    plan_start             DATE,
    plan_end               DATE,
    medicare_effective_date DATE,
    joined_at              DATE,
    is_new_to_medicare     BOOLEAN  NOT NULL DEFAULT FALSE,
    is_dual_eligible       BOOLEAN  NOT NULL DEFAULT FALSE,
    risk_tier              VARCHAR(32),
    last_synced_at         TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coding_member_chases (
    id                   INTEGER      PRIMARY KEY,
    member_id            INTEGER      NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    chase_code           VARCHAR(64)  NOT NULL,
    status               VARCHAR(32)  NOT NULL DEFAULT 'open',
    priority             VARCHAR(16)  NOT NULL DEFAULT 'normal',
    assigned_coder_id    INTEGER,
    assigned_coder_email VARCHAR(255),
    due_date             DATE,
    service_date_from    DATE,
    service_date_to      DATE,
    icd10_code           VARCHAR(12),
    hcc_code             VARCHAR(12),
    notes                TEXT,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_member_chases_member_id ON coding_member_chases(member_id);

CREATE TABLE IF NOT EXISTS coding_member_notes (
    id           INTEGER      PRIMARY KEY,
    member_id    INTEGER      NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    author_email VARCHAR(255) NOT NULL,
    author_name  VARCHAR(255),
    body         TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_member_notes_member_id ON coding_member_notes(member_id);

CREATE TABLE IF NOT EXISTS coding_member_attachments (
    id           INTEGER      PRIMARY KEY,
    member_id    INTEGER      NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    filename     VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    uploaded_by  VARCHAR(255),
    uploaded_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_external  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_coding_member_attachments_member_id ON coding_member_attachments(member_id);

CREATE TABLE IF NOT EXISTS coding_member_priorities (
    id                   INTEGER   PRIMARY KEY,
    member_id            INTEGER   NOT NULL UNIQUE REFERENCES coding_members(id) ON DELETE CASCADE,
    priority_score       FLOAT     NOT NULL,
    priority_tier        VARCHAR(16) NOT NULL,
    hcc_opportunity_count INTEGER  NOT NULL DEFAULT 0,
    next_action          VARCHAR(64),
    next_action_due      DATE,
    justification        TEXT,
    computed_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Coding domain — claims & coding activity
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coding_claims (
    id               INTEGER      PRIMARY KEY,
    member_id        INTEGER      NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    provider_id      INTEGER      REFERENCES coding_providers(id) ON DELETE SET NULL,
    claim_number     VARCHAR(64)  NOT NULL,
    claim_type       VARCHAR(32)  NOT NULL DEFAULT 'professional',
    service_date     DATE,
    diagnosis_codes  JSON,
    procedure_codes  JSON,
    hcc_codes        JSON,
    total_paid       FLOAT,
    source           VARCHAR(64),
    chart_required   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_claims_member_id    ON coding_claims(member_id);
CREATE INDEX IF NOT EXISTS ix_coding_claims_claim_number ON coding_claims(claim_number);

CREATE TABLE IF NOT EXISTS coding_mao004_records (
    id                  INTEGER     PRIMARY KEY,
    member_id           INTEGER     NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    submission_year     INTEGER     NOT NULL,
    hcc_code            VARCHAR(12) NOT NULL,
    icd10_code          VARCHAR(12),
    service_start       DATE,
    service_end         DATE,
    source_claim_number VARCHAR(64),
    status              VARCHAR(16) NOT NULL DEFAULT 'open',
    last_received_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_mao004_records_member_id        ON coding_mao004_records(member_id);
CREATE INDEX IF NOT EXISTS ix_coding_mao004_records_submission_year  ON coding_mao004_records(submission_year);

CREATE TABLE IF NOT EXISTS coding_health_assessments (
    id                INTEGER     PRIMARY KEY,
    member_id         INTEGER     NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    assessment_date   DATE        NOT NULL,
    assessment_type   VARCHAR(64) NOT NULL,
    provider_id       INTEGER     REFERENCES coding_providers(id) ON DELETE SET NULL,
    icd10_codes       JSON,
    hcc_codes         JSON,
    completion_status VARCHAR(32) NOT NULL DEFAULT 'pending_submission',
    notes             TEXT,
    created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_health_assessments_member_id   ON coding_health_assessments(member_id);
CREATE INDEX IF NOT EXISTS ix_coding_health_assessments_provider_id ON coding_health_assessments(provider_id);

CREATE TABLE IF NOT EXISTS coding_submission_batches (
    id              INTEGER      PRIMARY KEY,
    submission_year INTEGER      NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(255) NOT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'draft',
    record_count    INTEGER      NOT NULL DEFAULT 0,
    payload_path    VARCHAR(512)
);

CREATE INDEX IF NOT EXISTS ix_coding_submission_batches_submission_year ON coding_submission_batches(submission_year);

-- ─────────────────────────────────────────────
-- Ride booking domain
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ride_partners (
    id            INTEGER      PRIMARY KEY,
    company_name  VARCHAR(255) NOT NULL,
    contact_name  VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(32),
    status        VARCHAR(32)  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_partners_company_name ON ride_partners(company_name);

CREATE TABLE IF NOT EXISTS ride_partner_schedules (
    id            INTEGER     PRIMARY KEY,
    partner_id    INTEGER     NOT NULL REFERENCES ride_partners(id) ON DELETE CASCADE,
    frequency     VARCHAR(32) NOT NULL,
    start_date    DATE        NOT NULL,
    end_date      DATE        NOT NULL,
    open_slots    INTEGER     NOT NULL DEFAULT 0,
    days_of_week  JSON        NOT NULL DEFAULT '[]',
    days_of_month JSON        NOT NULL DEFAULT '[]',
    notes         TEXT,
    created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_partner_schedules_partner_id ON ride_partner_schedules(partner_id);

CREATE TABLE IF NOT EXISTS ride_partner_billing_profiles (
    id             INTEGER     PRIMARY KEY,
    partner_id     INTEGER     NOT NULL UNIQUE REFERENCES ride_partners(id) ON DELETE CASCADE,
    pay_to_name    VARCHAR(255),
    payment_email  VARCHAR(255),
    payment_method VARCHAR(64) NOT NULL DEFAULT 'ach',
    remit_address  TEXT,
    tax_id         VARCHAR(32),
    updated_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_partner_billing_profiles_partner_id ON ride_partner_billing_profiles(partner_id);

CREATE TABLE IF NOT EXISTS ride_bookings (
    id                VARCHAR(36)  PRIMARY KEY,
    partner_id        INTEGER      REFERENCES ride_partners(id) ON DELETE SET NULL,
    member_id         VARCHAR(64)  NOT NULL,
    first_name        VARCHAR(128) NOT NULL,
    last_name         VARCHAR(128) NOT NULL,
    ride_type         VARCHAR(128) NOT NULL,
    pickup            VARCHAR(255) NOT NULL,
    pickup_address    VARCHAR(512) NOT NULL,
    dropoff           VARCHAR(255) NOT NULL,
    dropoff_address   VARCHAR(512) NOT NULL,
    scheduled_pickup  TIMESTAMP    NOT NULL,
    estimated_dropoff TIMESTAMP,
    cost_usd          FLOAT,
    status            VARCHAR(32)  NOT NULL DEFAULT 'queued',
    created_by        VARCHAR(255),
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_bookings_partner_id       ON ride_bookings(partner_id);
CREATE INDEX IF NOT EXISTS ix_ride_bookings_member_id        ON ride_bookings(member_id);
CREATE INDEX IF NOT EXISTS ix_ride_bookings_scheduled_pickup ON ride_bookings(scheduled_pickup);
CREATE INDEX IF NOT EXISTS ix_ride_bookings_status           ON ride_bookings(status);

CREATE TABLE IF NOT EXISTS ride_payment_records (
    id                VARCHAR(36)  PRIMARY KEY,
    ride_id           VARCHAR(36)  REFERENCES ride_bookings(id) ON DELETE SET NULL,
    payer_type        VARCHAR(32)  NOT NULL,
    counterparty_name VARCHAR(255) NOT NULL,
    invoice_number    VARCHAR(64)  NOT NULL,
    amount_usd        FLOAT        NOT NULL DEFAULT 0,
    status            VARCHAR(32)  NOT NULL DEFAULT 'open',
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_payment_records_ride_id         ON ride_payment_records(ride_id);
CREATE INDEX IF NOT EXISTS ix_ride_payment_records_invoice_number  ON ride_payment_records(invoice_number);
CREATE INDEX IF NOT EXISTS ix_ride_payment_records_status          ON ride_payment_records(status);

CREATE TABLE IF NOT EXISTS ride_reconciliation_items (
    id         VARCHAR(36) PRIMARY KEY,
    title      VARCHAR(255) NOT NULL,
    detail     TEXT,
    status     VARCHAR(32)  NOT NULL DEFAULT 'open',
    priority   VARCHAR(32)  NOT NULL DEFAULT 'medium',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_reconciliation_items_status ON ride_reconciliation_items(status);

CREATE TABLE IF NOT EXISTS ride_payment_events (
    id         VARCHAR(36)  PRIMARY KEY,
    source     VARCHAR(64)  NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    detail     TEXT,
    payload    JSON         NOT NULL DEFAULT '{}',
    event_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_payment_events_source   ON ride_payment_events(source);
CREATE INDEX IF NOT EXISTS ix_ride_payment_events_event_at ON ride_payment_events(event_at);

-- ─────────────────────────────────────────────
-- Chat module (merged from nexora-chat)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_workbooks (
    id                 VARCHAR(64)  PRIMARY KEY,
    owner_email        VARCHAR(320) NOT NULL,
    original_filename  VARCHAR(256) NOT NULL,
    sheet_schema_json  TEXT         NOT NULL DEFAULT '{}',
    size_bytes         BIGINT       NOT NULL DEFAULT 0,
    status             VARCHAR(16)  NOT NULL DEFAULT 'pending',
    error_message      TEXT,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_chat_workbooks_owner_email      ON chat_workbooks(owner_email);
CREATE INDEX IF NOT EXISTS ix_chat_workbooks_last_accessed_at ON chat_workbooks(last_accessed_at);

CREATE TABLE IF NOT EXISTS chat_dataset_loads (
    id            VARCHAR(64)  PRIMARY KEY,
    table_name    VARCHAR(63)  NOT NULL,
    mode          VARCHAR(16)  NOT NULL,
    source        VARCHAR(16)  NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
    row_count     BIGINT       NOT NULL DEFAULT 0,
    started_by    VARCHAR(320) NOT NULL,
    started_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at   TIMESTAMP,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS ix_chat_dataset_loads_table_name ON chat_dataset_loads(table_name);
CREATE INDEX IF NOT EXISTS ix_chat_dataset_loads_started_at ON chat_dataset_loads(started_at);

-- Shared analytics dataset tables (per-tenant copy).
-- Schemas are intentionally permissive (TEXT for most ID-like fields, NUMERIC
-- for currency, DATE for service dates). Refine per-tenant if a column is
-- known to be uniformly numeric/categorical.

CREATE TABLE IF NOT EXISTS php_claim_details (
    claim_number     TEXT,
    member_id        TEXT,
    provider_npi     TEXT,
    service_date     DATE,
    icd10_code       TEXT,
    procedure_code   TEXT,
    revenue_code     TEXT,
    pos_code         TEXT,
    paid_amount      NUMERIC(14, 2),
    billed_amount    NUMERIC(14, 2),
    line_of_business TEXT,
    loaded_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_claim_details_member_id    ON php_claim_details(member_id);
CREATE INDEX IF NOT EXISTS ix_php_claim_details_service_date ON php_claim_details(service_date);

CREATE TABLE IF NOT EXISTS php_enrollment_details (
    member_id        TEXT,
    plan_id          TEXT,
    plan_name        TEXT,
    coverage_start   DATE,
    coverage_end     DATE,
    line_of_business TEXT,
    status           TEXT,
    loaded_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_enrollment_details_member_id ON php_enrollment_details(member_id);

CREATE TABLE IF NOT EXISTS php_member_details (
    member_id     TEXT,
    first_name    TEXT,
    last_name     TEXT,
    date_of_birth DATE,
    gender        TEXT,
    address_city  TEXT,
    address_state TEXT,
    address_zip   TEXT,
    primary_lang  TEXT,
    loaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_member_details_member_id ON php_member_details(member_id);

CREATE TABLE IF NOT EXISTS php_member_pcp_details (
    member_id    TEXT,
    pcp_npi      TEXT,
    pcp_name     TEXT,
    assigned_from DATE,
    assigned_to   DATE,
    loaded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_member_pcp_details_member_id ON php_member_pcp_details(member_id);

CREATE TABLE IF NOT EXISTS php_pharmacy (
    member_id     TEXT,
    rx_number     TEXT,
    ndc           TEXT,
    drug_name     TEXT,
    fill_date     DATE,
    days_supply   INTEGER,
    quantity      NUMERIC(12, 2),
    paid_amount   NUMERIC(12, 2),
    pharmacy_npi  TEXT,
    loaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_pharmacy_member_id ON php_pharmacy(member_id);
CREATE INDEX IF NOT EXISTS ix_php_pharmacy_fill_date ON php_pharmacy(fill_date);

CREATE TABLE IF NOT EXISTS php_provider (
    provider_npi  TEXT,
    name          TEXT,
    specialty     TEXT,
    network_status TEXT,
    loaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_provider_provider_npi ON php_provider(provider_npi);

CREATE TABLE IF NOT EXISTS php_provider_affiliation (
    provider_npi TEXT,
    group_npi    TEXT,
    group_name   TEXT,
    affiliation_start DATE,
    affiliation_end   DATE,
    loaded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_provider_affiliation_provider_npi ON php_provider_affiliation(provider_npi);

CREATE TABLE IF NOT EXISTS php_provider_location (
    provider_npi  TEXT,
    address_line1 TEXT,
    city          TEXT,
    state         TEXT,
    postal_code   TEXT,
    phone         TEXT,
    loaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_php_provider_location_provider_npi ON php_provider_location(provider_npi);

CREATE TABLE IF NOT EXISTS medication_adherence (
    member_id      TEXT,
    measure_year   INTEGER,
    measure_name   TEXT,
    pdc            NUMERIC(5, 2),
    is_adherent    BOOLEAN,
    drug_class     TEXT,
    loaded_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_medication_adherence_member_id    ON medication_adherence(member_id);
CREATE INDEX IF NOT EXISTS ix_medication_adherence_measure_year ON medication_adherence(measure_year);

-- ─────────────────────────────────────────────
-- Nexora Lab Member360 domain
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS m360_members (
    id                       SERIAL        PRIMARY KEY,
    member_key               VARCHAR(64)   NOT NULL UNIQUE,
    first_name               VARCHAR(80),
    last_name                VARCHAR(80),
    date_of_birth            DATE,
    gender                   VARCHAR(16),
    plan_name                VARCHAR(128),
    line_of_business         VARCHAR(64),
    phone                    VARCHAR(32),
    email                    VARCHAR(255),
    address_line1            VARCHAR(160),
    address_city             VARCHAR(64),
    address_state            VARCHAR(2),
    address_zip              VARCHAR(10),
    preferred_language       VARCHAR(48),
    preferred_channel        VARCHAR(32),
    primary_care_provider    VARCHAR(128),
    risk_score_composite     NUMERIC(6, 2),
    risk_tier                VARCHAR(16),
    clinical_risk_score      NUMERIC(6, 2),
    utilization_risk_score   NUMERIC(6, 2),
    cost_risk_score          NUMERIC(6, 2),
    engagement_risk_score    NUMERIC(6, 2),
    open_care_gaps           INTEGER       NOT NULL DEFAULT 0,
    next_best_action         VARCHAR(255),
    last_interaction_at      TIMESTAMP,
    created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_members_member_key ON m360_members(member_key);
CREATE INDEX IF NOT EXISTS ix_m360_members_risk_tier  ON m360_members(risk_tier);

CREATE TABLE IF NOT EXISTS m360_care_journey_templates (
    id                          SERIAL        PRIMARY KEY,
    name                        VARCHAR(160)  NOT NULL,
    description                 TEXT,
    category                    VARCHAR(64),
    recommended_for_risk_tier   VARCHAR(16),
    default_stages              JSON,
    default_tasks               JSON,
    created_by                  VARCHAR(255),
    created_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS m360_risk_insights (
    id              SERIAL        PRIMARY KEY,
    member_id       INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    domain          VARCHAR(32)   NOT NULL,
    score           FLOAT         NOT NULL,
    driver          VARCHAR(255),
    recommendation  TEXT,
    confidence      FLOAT,
    last_updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_risk_insights_member_id ON m360_risk_insights(member_id);

CREATE TABLE IF NOT EXISTS m360_care_journeys (
    id                      SERIAL        PRIMARY KEY,
    member_id               INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    template_id             INTEGER       REFERENCES m360_care_journey_templates(id) ON DELETE SET NULL,
    name                    VARCHAR(160)  NOT NULL,
    description             TEXT,
    status                  VARCHAR(16)   NOT NULL DEFAULT 'active',
    created_by              VARCHAR(255),
    assigned_to             VARCHAR(255),
    start_date              DATE,
    target_completion_date  DATE,
    source                  VARCHAR(64),
    template_name           VARCHAR(160),
    created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_care_journeys_member_id ON m360_care_journeys(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_care_journeys_status    ON m360_care_journeys(status);

CREATE TABLE IF NOT EXISTS m360_care_journey_stages (
    id           SERIAL        PRIMARY KEY,
    journey_id   INTEGER       NOT NULL REFERENCES m360_care_journeys(id) ON DELETE CASCADE,
    sequence     INTEGER       NOT NULL DEFAULT 0,
    name         VARCHAR(160)  NOT NULL,
    description  TEXT,
    status       VARCHAR(16)   NOT NULL DEFAULT 'pending',
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_care_journey_stages_journey_id ON m360_care_journey_stages(journey_id);

CREATE TABLE IF NOT EXISTS m360_tasks (
    id                      SERIAL        PRIMARY KEY,
    member_id               INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    journey_id              INTEGER       REFERENCES m360_care_journeys(id) ON DELETE SET NULL,
    title                   VARCHAR(255)  NOT NULL,
    description             TEXT,
    assigned_user           VARCHAR(255),
    assigned_queue          VARCHAR(64),
    priority                VARCHAR(16)   NOT NULL DEFAULT 'medium',
    status                  VARCHAR(16)   NOT NULL DEFAULT 'open',
    due_date                DATE,
    sbar_situation          TEXT,
    sbar_background         TEXT,
    sbar_assessment         TEXT,
    sbar_recommendation     TEXT,
    recommended_next_action VARCHAR(255),
    auto_generated_reason   VARCHAR(255),
    notes                   TEXT,
    created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_tasks_member_id  ON m360_tasks(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_tasks_journey_id ON m360_tasks(journey_id);
CREATE INDEX IF NOT EXISTS ix_m360_tasks_status    ON m360_tasks(status);
CREATE INDEX IF NOT EXISTS ix_m360_tasks_priority  ON m360_tasks(priority);

CREATE TABLE IF NOT EXISTS m360_notes (
    id                  SERIAL        PRIMARY KEY,
    member_id           INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    author_email        VARCHAR(255)  NOT NULL,
    author_name         VARCHAR(255),
    channel             VARCHAR(32)   NOT NULL DEFAULT 'internal',
    note_type           VARCHAR(64),
    body                TEXT          NOT NULL,
    related_task_id     INTEGER       REFERENCES m360_tasks(id) ON DELETE SET NULL,
    related_journey_id  INTEGER       REFERENCES m360_care_journeys(id) ON DELETE SET NULL,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_notes_member_id  ON m360_notes(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_notes_created_at ON m360_notes(created_at);

CREATE TABLE IF NOT EXISTS m360_messages (
    id         SERIAL        PRIMARY KEY,
    member_id  INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    channel    VARCHAR(32)   NOT NULL DEFAULT 'chat',
    direction  VARCHAR(16)   NOT NULL DEFAULT 'outbound',
    sender     VARCHAR(255),
    recipient  VARCHAR(255),
    body       TEXT          NOT NULL,
    status     VARCHAR(16)   NOT NULL DEFAULT 'sent',
    timestamp  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_messages_member_id ON m360_messages(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_messages_timestamp ON m360_messages(timestamp);

CREATE TABLE IF NOT EXISTS m360_claims (
    id                      SERIAL          PRIMARY KEY,
    member_id               INTEGER         NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    claim_number            VARCHAR(64)     NOT NULL,
    service_date            DATE,
    provider                VARCHAR(160),
    category                VARCHAR(64),
    status                  VARCHAR(32)     NOT NULL DEFAULT 'paid',
    billed_amount           NUMERIC(12, 2),
    paid_amount             NUMERIC(12, 2),
    member_responsibility   NUMERIC(12, 2)
);

CREATE INDEX IF NOT EXISTS ix_m360_claims_member_id    ON m360_claims(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_claims_claim_number ON m360_claims(claim_number);

CREATE TABLE IF NOT EXISTS m360_accumulators (
    id                  SERIAL          PRIMARY KEY,
    member_id           INTEGER         NOT NULL UNIQUE REFERENCES m360_members(id) ON DELETE CASCADE,
    deductible          NUMERIC(12, 2),
    deductible_met      NUMERIC(12, 2),
    out_of_pocket_max   NUMERIC(12, 2),
    out_of_pocket_met   NUMERIC(12, 2),
    plan_year_start     DATE,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_accumulators_member_id ON m360_accumulators(member_id);

CREATE TABLE IF NOT EXISTS m360_care_options (
    id                          SERIAL          PRIMARY KEY,
    member_id                   INTEGER         NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    service_type                VARCHAR(160)    NOT NULL,
    recommended_provider        VARCHAR(160),
    facility_name               VARCHAR(160),
    cost_estimate               NUMERIC(12, 2),
    quality_score               FLOAT,
    distance_miles              FLOAT,
    network_status              VARCHAR(32),
    potential_savings           NUMERIC(12, 2),
    rationale                   TEXT,
    member_facing_explanation   TEXT,
    status                      VARCHAR(32)     NOT NULL DEFAULT 'recommended',
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_care_options_member_id ON m360_care_options(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_care_options_status    ON m360_care_options(status);

CREATE TABLE IF NOT EXISTS m360_savings (
    id                      SERIAL          PRIMARY KEY,
    member_id               INTEGER         NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    care_option_id          INTEGER         REFERENCES m360_care_options(id) ON DELETE SET NULL,
    original_expected_cost  NUMERIC(12, 2),
    steered_option_cost     NUMERIC(12, 2),
    estimated_savings       NUMERIC(12, 2),
    claim_received          BOOLEAN         NOT NULL DEFAULT FALSE,
    savings_validated       BOOLEAN         NOT NULL DEFAULT FALSE,
    validation_status       VARCHAR(32)     NOT NULL DEFAULT 'pending',
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_savings_member_id ON m360_savings(member_id);

CREATE TABLE IF NOT EXISTS m360_documents (
    id                SERIAL        PRIMARY KEY,
    member_id         INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    file_name         VARCHAR(255)  NOT NULL,
    document_type     VARCHAR(64),
    uploaded_by       VARCHAR(255),
    uploaded_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status            VARCHAR(32)   NOT NULL DEFAULT 'active',
    storage_backend   VARCHAR(32),
    storage_path      VARCHAR(512),
    content_type      VARCHAR(128),
    size_bytes        INTEGER,
    sha256            VARCHAR(64)
);

-- Storage columns are nullable so document rows imported with metadata only
-- (no uploaded file) still validate. ADD COLUMN IF NOT EXISTS lets tenant
-- DBs that pre-date document upload pick up the new columns on next deploy.
ALTER TABLE m360_documents ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(32);
ALTER TABLE m360_documents ADD COLUMN IF NOT EXISTS storage_path    VARCHAR(512);
ALTER TABLE m360_documents ADD COLUMN IF NOT EXISTS content_type    VARCHAR(128);
ALTER TABLE m360_documents ADD COLUMN IF NOT EXISTS size_bytes      INTEGER;
ALTER TABLE m360_documents ADD COLUMN IF NOT EXISTS sha256          VARCHAR(64);

CREATE INDEX IF NOT EXISTS ix_m360_documents_member_id ON m360_documents(member_id);

-- Clinical data tables --------------------------------------------------------
-- Problems / medications / labs are all member-scoped, all upsertable by
-- natural key. See app/models/member360.py for the corresponding ORM models.

CREATE TABLE IF NOT EXISTS m360_problems (
    id              SERIAL        PRIMARY KEY,
    member_id       INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    code            VARCHAR(32)   NOT NULL,
    code_system     VARCHAR(16)   NOT NULL DEFAULT 'ICD-10',
    description     VARCHAR(255),
    status          VARCHAR(16)   NOT NULL DEFAULT 'active',
    severity        VARCHAR(16),
    is_primary      BOOLEAN       NOT NULL DEFAULT FALSE,
    onset_date      DATE,
    resolved_date   DATE,
    recorded_by     VARCHAR(255),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_problems_member_id ON m360_problems(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_problems_code      ON m360_problems(code);
CREATE INDEX IF NOT EXISTS ix_m360_problems_status    ON m360_problems(status);

CREATE TABLE IF NOT EXISTS m360_medications (
    id                 SERIAL        PRIMARY KEY,
    member_id          INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    rx_number          VARCHAR(64)   NOT NULL,
    ndc_code           VARCHAR(16),
    drug_name          VARCHAR(255)  NOT NULL,
    generic_name       VARCHAR(255),
    dose               VARCHAR(64),
    dose_unit          VARCHAR(32),
    route              VARCHAR(32),
    frequency          VARCHAR(64),
    days_supply        INTEGER,
    refills_remaining  INTEGER,
    prescriber         VARCHAR(160),
    pharmacy           VARCHAR(160),
    start_date         DATE,
    end_date           DATE,
    last_fill_date     DATE,
    status             VARCHAR(16)   NOT NULL DEFAULT 'active',
    created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_medications_member_id ON m360_medications(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_medications_rx_number ON m360_medications(rx_number);
CREATE INDEX IF NOT EXISTS ix_m360_medications_status    ON m360_medications(status);

CREATE TABLE IF NOT EXISTS m360_labs (
    id                    SERIAL        PRIMARY KEY,
    member_id             INTEGER       NOT NULL REFERENCES m360_members(id) ON DELETE CASCADE,
    loinc_code            VARCHAR(16)   NOT NULL,
    test_name             VARCHAR(160)  NOT NULL,
    result_value          VARCHAR(64),
    result_unit           VARCHAR(32),
    reference_range_low   DOUBLE PRECISION,
    reference_range_high  DOUBLE PRECISION,
    abnormal_flag         VARCHAR(4),
    result_date           DATE          NOT NULL,
    ordering_provider     VARCHAR(160),
    performing_lab        VARCHAR(160),
    status                VARCHAR(16)   NOT NULL DEFAULT 'final',
    created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_m360_labs_member_id   ON m360_labs(member_id);
CREATE INDEX IF NOT EXISTS ix_m360_labs_loinc_code  ON m360_labs(loinc_code);
CREATE INDEX IF NOT EXISTS ix_m360_labs_result_date ON m360_labs(result_date);
