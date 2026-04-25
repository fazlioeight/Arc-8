-- Per-tenant (TenantDataBase) tables. Run within each tenant schema/database.

CREATE TABLE IF NOT EXISTS members (
    id         INTEGER PRIMARY KEY,
    member_key VARCHAR(64)  NOT NULL,
    name       VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS ix_members_member_key ON members(member_key);

CREATE TABLE IF NOT EXISTS claims (
    id           INTEGER PRIMARY KEY,
    member_key   VARCHAR(64) NOT NULL,
    service_date DATE,
    cost         NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_claims_member_key ON claims(member_key);

CREATE TABLE IF NOT EXISTS coding_members (
    id                INTEGER PRIMARY KEY,
    member_key        VARCHAR(64)  NOT NULL UNIQUE,
    first_name        VARCHAR(80),
    last_name         VARCHAR(80),
    date_of_birth     DATE,
    gender            VARCHAR(1),
    status            VARCHAR(32)  NOT NULL DEFAULT 'active',
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

CREATE TABLE IF NOT EXISTS coding_member_chases (
    id                   INTEGER PRIMARY KEY,
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
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_member_chases_member_id ON coding_member_chases(member_id);

CREATE TABLE IF NOT EXISTS coding_member_notes (
    id           INTEGER PRIMARY KEY,
    member_id    INTEGER      NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    author_email VARCHAR(255) NOT NULL,
    author_name  VARCHAR(255),
    body         TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coding_member_notes_member_id ON coding_member_notes(member_id);

CREATE TABLE IF NOT EXISTS coding_member_attachments (
    id           INTEGER PRIMARY KEY,
    member_id    INTEGER      NOT NULL REFERENCES coding_members(id) ON DELETE CASCADE,
    filename     VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    uploaded_by  VARCHAR(255),
    uploaded_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_external  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_coding_member_attachments_member_id ON coding_member_attachments(member_id);

CREATE TABLE IF NOT EXISTS coding_providers (
    id     INTEGER PRIMARY KEY,
    npi    VARCHAR(15) UNIQUE,
    tax_id VARCHAR(15),
    name   VARCHAR(128) NOT NULL,
    phone  VARCHAR(20),
    email  VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS ix_coding_providers_npi ON coding_providers(npi);

CREATE TABLE IF NOT EXISTS coding_provider_locations (
    id            INTEGER PRIMARY KEY,
    provider_id   INTEGER NOT NULL UNIQUE REFERENCES coding_providers(id) ON DELETE CASCADE,
    address_line1 VARCHAR(120),
    city          VARCHAR(64),
    state         VARCHAR(2),
    postal_code   VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS ride_partners (
    id            INTEGER PRIMARY KEY,
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
    id            INTEGER PRIMARY KEY,
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
    id             INTEGER PRIMARY KEY,
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
    id                VARCHAR(36) PRIMARY KEY,
    partner_id        INTEGER REFERENCES ride_partners(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS ix_ride_bookings_partner_id ON ride_bookings(partner_id);
CREATE INDEX IF NOT EXISTS ix_ride_bookings_member_id ON ride_bookings(member_id);
CREATE INDEX IF NOT EXISTS ix_ride_bookings_scheduled_pickup ON ride_bookings(scheduled_pickup);
CREATE INDEX IF NOT EXISTS ix_ride_bookings_status ON ride_bookings(status);

CREATE TABLE IF NOT EXISTS ride_payment_records (
    id                VARCHAR(36) PRIMARY KEY,
    ride_id           VARCHAR(36) REFERENCES ride_bookings(id) ON DELETE SET NULL,
    payer_type        VARCHAR(32)  NOT NULL,
    counterparty_name VARCHAR(255) NOT NULL,
    invoice_number    VARCHAR(64)  NOT NULL,
    amount_usd        FLOAT        NOT NULL DEFAULT 0,
    status            VARCHAR(32)  NOT NULL DEFAULT 'open',
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ride_payment_records_ride_id ON ride_payment_records(ride_id);
CREATE INDEX IF NOT EXISTS ix_ride_payment_records_invoice_number ON ride_payment_records(invoice_number);
CREATE INDEX IF NOT EXISTS ix_ride_payment_records_status ON ride_payment_records(status);

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
    id         VARCHAR(36) PRIMARY KEY,
    source     VARCHAR(64)  NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    detail     TEXT,
    payload    JSON         NOT NULL DEFAULT '{}',
    event_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
