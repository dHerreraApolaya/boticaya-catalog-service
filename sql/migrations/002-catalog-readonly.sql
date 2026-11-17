BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

CREATE ROLE boticaya_catalog_app
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE TABLE public.products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    presentation TEXT NOT NULL,
    price_in_cents INTEGER NOT NULL CHECK (price_in_cents >= 0),
    available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
    requires_prescription BOOLEAN NOT NULL,
    is_featured BOOLEAN NOT NULL
);

REVOKE ALL ON TABLE public.products FROM PUBLIC;

DO $catalog_permissions$
DECLARE
    api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.products FROM %I', api_role);
        END IF;
    END LOOP;
    IF has_schema_privilege('boticaya_catalog_app', 'public', 'CREATE') THEN
        RAISE EXCEPTION 'PUBLIC schema grants CREATE indirectly; review schema privileges before provisioning';
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO boticaya_catalog_app', current_database());
END
$catalog_permissions$;

GRANT USAGE ON SCHEMA public TO boticaya_catalog_app;
GRANT SELECT ON TABLE public.products TO boticaya_catalog_app;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

CREATE POLICY catalog_api_read
    ON public.products FOR SELECT TO boticaya_catalog_app USING (true);

ALTER ROLE boticaya_catalog_app SET default_transaction_read_only = on;

COMMIT;
