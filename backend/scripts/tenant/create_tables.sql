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
