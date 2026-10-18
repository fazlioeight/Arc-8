-- ============================================================================
-- Least-privilege application database role for the Nexora Platform.
--
-- The application connects as a role that can read/write row data but CANNOT
-- alter schema, drop objects, or perform superuser actions. Schema changes are
-- the exclusive job of the *migration* role (Alembic), which uses a separate,
-- more-privileged connection string that is NOT shipped to the running app.
--
-- HIPAA §164.312(a)(1) (access control) + principle of least privilege.
--
-- Usage (run as a superuser / the database owner), substituting the password
-- from your secret store — never hard-code it:
--
--   psql "$ADMIN_DATABASE_URL" \
--        -v app_user=nexora_app \
--        -v app_password="$NEXORA_APP_DB_PASSWORD" \
--        -f scripts/create_app_db_user.sql
--
-- Re-runnable: creating the role is guarded; GRANTs are idempotent.
-- Run once per database (control DB and each tenant DB/schema).
-- ============================================================================

\set ON_ERROR_STOP on

-- 1. Create the login role if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password');
    END IF;
END
$$;

-- Explicitly strip any privileged attributes (defensive: in case the role
-- pre-existed with broader rights).
ALTER ROLE :"app_user" NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- 2. Allow connecting + using the schema, but not creating objects in it.
GRANT CONNECT ON DATABASE current_database() TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM :"app_user";

-- 3. DML only on existing tables. Deliberately NO TRUNCATE, NO REFERENCES,
--    NO DDL. DELETE is granted because some flows hard-delete rows (e.g.
--    revoked tokens, expired imports); drop it from this list if your data
--    retention policy forbids physical deletes.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";

-- Sequences backing SERIAL/IDENTITY primary keys need USAGE+SELECT for INSERTs.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

-- 4. Same grants for tables/sequences created by FUTURE migrations, so the
--    migration role doesn't have to re-grant after every deploy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- 5. Hard denials — make the intent explicit and auditable.
REVOKE ALL ON DATABASE current_database() FROM PUBLIC;
-- The app role gets EXECUTE on functions only where needed; revoke the blanket
-- PUBLIC grant so newly created functions aren't world-executable.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Verify (prints the role's attributes; all the privileged flags must be 'f').
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
FROM pg_roles
WHERE rolname = :'app_user';
