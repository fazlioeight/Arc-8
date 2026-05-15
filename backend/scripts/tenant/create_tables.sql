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
