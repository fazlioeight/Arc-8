-- Nexora control-plane (global) tables

CREATE TABLE IF NOT EXISTS tenants (
    id                   INTEGER PRIMARY KEY,
    key                  VARCHAR(64)  NOT NULL UNIQUE,
    slug                 VARCHAR(128) NOT NULL UNIQUE,
    name                 VARCHAR(255) NOT NULL,
    status               VARCHAR(32)  NOT NULL DEFAULT 'active',
    region               VARCHAR(64),
    db_connection_uri    VARCHAR(512) NOT NULL,
    db_schema            VARCHAR(128),
    billing_plan         VARCHAR(64)  NOT NULL DEFAULT 'standard',
    feature_flags        JSON         NOT NULL DEFAULT '{}',
    purchased_applications JSON      NOT NULL DEFAULT '{}',
    sso_metadata         TEXT,
    phi_data_classification VARCHAR(64) NOT NULL DEFAULT 'restricted',
    data_residency       VARCHAR(64),
    encryption_key_id    VARCHAR(128),
    created_by           VARCHAR(255),
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_tenants_key  ON tenants(key);
CREATE INDEX IF NOT EXISTS ix_tenants_slug ON tenants(slug);

CREATE TABLE IF NOT EXISTS tenant_audit_events (
    id         INTEGER PRIMARY KEY,
    tenant_id  INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor      VARCHAR(255) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload    JSON         NOT NULL DEFAULT '{}',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_tenant_audit_events_tenant_id ON tenant_audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS ix_tenant_audit_events_created_at ON tenant_audit_events(created_at);

CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY,
    tenant_id      INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(64)  NOT NULL DEFAULT 'user',
    app_permissions JSON        NOT NULL DEFAULT '{}',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMP,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS ix_users_email     ON users(email);

CREATE TABLE IF NOT EXISTS user_preferences (
    id             INTEGER PRIMARY KEY,
    tenant_id      INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(128) NOT NULL,
    value          JSON         NOT NULL DEFAULT '{}',
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_preference_key UNIQUE (tenant_id, user_id, preference_key)
);

CREATE INDEX IF NOT EXISTS ix_user_preferences_tenant_id ON user_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS ix_user_preferences_user_id ON user_preferences(user_id);

CREATE TABLE IF NOT EXISTS docs_articles (
    id         INTEGER PRIMARY KEY,
    tenant_id  INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    summary    TEXT,
    content    TEXT,
    app_key    VARCHAR(64),
    tags       JSON         NOT NULL DEFAULT '[]',
    status     VARCHAR(32)  NOT NULL DEFAULT 'published',
    created_by VARCHAR(255),
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_docs_articles_tenant_id ON docs_articles(tenant_id);
CREATE INDEX IF NOT EXISTS ix_docs_articles_status ON docs_articles(status);

CREATE TABLE IF NOT EXISTS usage_counters (
    id        INTEGER PRIMARY KEY,
    tenant_id INTEGER      NOT NULL,
    date      DATE         NOT NULL,
    key       VARCHAR(64)  NOT NULL,
    count     INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT uq_usage_day_key UNIQUE (tenant_id, date, key)
);

CREATE INDEX IF NOT EXISTS ix_usage_counters_tenant_id ON usage_counters(tenant_id);
