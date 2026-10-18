#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE nexora_control' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nexora_control')\gexec
    SELECT 'CREATE DATABASE prominence_tenant' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'prominence_tenant')\gexec
    GRANT ALL PRIVILEGES ON DATABASE nexora_control TO "$POSTGRES_USER";
    GRANT ALL PRIVILEGES ON DATABASE prominence_tenant TO "$POSTGRES_USER";
EOSQL
