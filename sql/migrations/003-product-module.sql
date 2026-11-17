BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE SCHEMA catalog_internal;
REVOKE ALL ON SCHEMA catalog_internal FROM PUBLIC;

CREATE FUNCTION catalog_internal.normalize(value TEXT) RETURNS TEXT
LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog
AS $$ SELECT lower(regexp_replace(trim(extensions.unaccent(value)), '\s+', ' ', 'g')) $$;
REVOKE ALL ON FUNCTION catalog_internal.normalize(TEXT) FROM PUBLIC;

CREATE ROLE boticaya_catalog_editor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    name_key TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    name_key TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION catalog_internal.prepare_directory() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.name := trim(NEW.name);
    NEW.name_key := catalog_internal.normalize(NEW.name);
    IF NEW.slug IS NULL THEN
        NEW.slug := trim(both '-' from regexp_replace(NEW.name_key, '[^a-z0-9]+', '-', 'g'));
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION catalog_internal.prepare_directory() FROM PUBLIC;
CREATE TRIGGER prepare_category BEFORE INSERT OR UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION catalog_internal.prepare_directory();
CREATE TRIGGER prepare_brand BEFORE INSERT OR UPDATE ON public.brands
    FOR EACH ROW EXECUTE FUNCTION catalog_internal.prepare_directory();

INSERT INTO public.categories(name)
    SELECT min(trim(category)) FROM public.products GROUP BY catalog_internal.normalize(category);
INSERT INTO public.brands(name)
    SELECT min(trim(brand)) FROM public.products WHERE trim(brand) <> '' GROUP BY catalog_internal.normalize(brand);

ALTER TABLE public.products
    ADD COLUMN category_id UUID REFERENCES public.categories(id),
    ADD COLUMN brand_id UUID REFERENCES public.brands(id),
    ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
    ADD COLUMN keywords TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(keywords) <= 30 AND array_position(keywords, NULL) IS NULL),
    ADD COLUMN currency TEXT NOT NULL DEFAULT 'PEN' CHECK (currency ~ '^[A-Z]{3}$'),
    ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
    ADD COLUMN sku_key TEXT,
    ADD COLUMN search_document TSVECTOR,
    ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.products p SET category_id = c.id FROM public.categories c WHERE c.name_key = catalog_internal.normalize(p.category);
UPDATE public.products p SET brand_id = b.id FROM public.brands b WHERE b.name_key = catalog_internal.normalize(p.brand);
ALTER TABLE public.products
    ALTER COLUMN category_id SET NOT NULL,
    ALTER COLUMN category SET DEFAULT '',
    ALTER COLUMN brand SET DEFAULT '',
    ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
    ALTER COLUMN available_quantity SET DEFAULT 0,
    ALTER COLUMN requires_prescription SET DEFAULT false,
    ALTER COLUMN is_featured SET DEFAULT false,
    ADD CONSTRAINT products_name_nonempty CHECK (length(trim(name)) BETWEEN 1 AND 300),
    ADD CONSTRAINT products_sku_length CHECK (length(trim(sku)) BETWEEN 1 AND 100),
    ADD CONSTRAINT products_presentation_length CHECK (length(trim(presentation)) BETWEEN 1 AND 300);

CREATE FUNCTION catalog_internal.prepare_product() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE selected_category TEXT; selected_brand TEXT;
BEGIN
    SELECT name INTO STRICT selected_category FROM public.categories WHERE id=NEW.category_id;
    IF NEW.brand_id IS NOT NULL THEN
        SELECT name INTO STRICT selected_brand FROM public.brands WHERE id=NEW.brand_id;
    END IF;
    IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Product identifiers are immutable' USING ERRCODE='23514';
    END IF;
    NEW.category := selected_category;
    NEW.brand := coalesce(selected_brand, '');
    NEW.name := trim(NEW.name);
    NEW.sku := trim(NEW.sku);
    NEW.sku_key := catalog_internal.normalize(NEW.sku);
    IF cardinality(NEW.keywords) > 30 OR array_position(NEW.keywords,NULL) IS NOT NULL
       OR EXISTS(SELECT 1 FROM unnest(NEW.keywords) word WHERE length(trim(word)) NOT BETWEEN 1 AND 80) THEN
        RAISE EXCEPTION 'Invalid catalog keywords' USING ERRCODE='23514';
    END IF;
    NEW.keywords := ARRAY(SELECT DISTINCT catalog_internal.normalize(word) FROM unnest(NEW.keywords) word ORDER BY 1);
    NEW.search_document :=
        setweight(to_tsvector('pg_catalog.simple',catalog_internal.normalize(NEW.sku || ' ' || NEW.name)),'A') ||
        setweight(to_tsvector('pg_catalog.simple',array_to_string(NEW.keywords,' ')),'B') ||
        setweight(to_tsvector('pg_catalog.simple',catalog_internal.normalize(NEW.brand || ' ' || NEW.category || ' ' || NEW.presentation)),'C');
    NEW.version := CASE WHEN TG_OP='UPDATE' THEN OLD.version+1 ELSE 1 END;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION catalog_internal.prepare_product() FROM PUBLIC;
CREATE TRIGGER prepare_product BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION catalog_internal.prepare_product();
UPDATE public.products SET name=name;
ALTER TABLE public.products ALTER COLUMN sku_key SET NOT NULL, ALTER COLUMN search_document SET NOT NULL;
CREATE UNIQUE INDEX products_sku_key_unique ON public.products(sku_key);
CREATE INDEX products_category_id_idx ON public.products(category_id);
CREATE INDEX products_brand_id_idx ON public.products(brand_id);
CREATE INDEX products_search_gin ON public.products USING GIN(search_document) WHERE status='published';
CREATE INDEX products_published_id_idx ON public.products(id) WHERE status='published';
CREATE INDEX products_featured_id_idx ON public.products(id) WHERE status='published' AND is_featured;

CREATE FUNCTION catalog_internal.refresh_directory_products() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        IF TG_TABLE_NAME='categories' THEN
            UPDATE public.products SET category=NEW.name WHERE category_id=NEW.id;
        ELSE
            UPDATE public.products SET brand=NEW.name WHERE brand_id=NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION catalog_internal.refresh_directory_products() FROM PUBLIC;
CREATE TRIGGER refresh_category_products AFTER UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION catalog_internal.refresh_directory_products();
CREATE TRIGGER refresh_brand_products AFTER UPDATE ON public.brands
    FOR EACH ROW EXECUTE FUNCTION catalog_internal.refresh_directory_products();

CREATE TABLE public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    bucket TEXT NOT NULL CHECK (bucket IN ('product-image-uploads','product-images')),
    storage_path TEXT NOT NULL CHECK (length(storage_path) BETWEEN 1 AND 500 AND storage_path !~ '(^/|(^|/)\.\.(/|$))'),
    alt_text TEXT NOT NULL DEFAULT '' CHECK (length(alt_text) <= 300),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
    byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
    width INTEGER CHECK (width BETWEEN 1 AND 10000),
    height INTEGER CHECK (height BETWEEN 1 AND 10000),
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed','deleting')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(bucket,storage_path),
    CHECK (status <> 'published' OR (bucket='product-images' AND width IS NOT NULL AND height IS NOT NULL))
);
CREATE INDEX product_images_product_id_idx ON public.product_images(product_id);
CREATE INDEX product_images_published_order_idx ON public.product_images(product_id,display_order,id) WHERE status='published';
CREATE FUNCTION catalog_internal.touch_image() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION catalog_internal.touch_image() FROM PUBLIC;
CREATE TRIGGER touch_image BEFORE UPDATE ON public.product_images FOR EACH ROW EXECUTE FUNCTION catalog_internal.touch_image();

CREATE FUNCTION catalog_internal.search_query(value TEXT) RETURNS TSQUERY
LANGUAGE sql STABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
    SELECT to_tsquery('pg_catalog.simple',string_agg(quote_literal(token)||':*',' & '))
    FROM regexp_split_to_table(catalog_internal.normalize(value),'[^[:alnum:]]+') AS words(token)
    WHERE token <> ''
$$;
REVOKE ALL ON FUNCTION catalog_internal.search_query(TEXT) FROM PUBLIC;

CREATE FUNCTION catalog_internal.search_product_ids(
    normalized_sku TEXT, search_terms TSQUERY, selected_category UUID,
    selected_brand UUID, featured_only BOOLEAN, after_id TEXT
) RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
    SELECT p.id FROM public.products p JOIN public.categories c ON c.id=p.category_id
    LEFT JOIN public.brands b ON b.id=p.brand_id
    WHERE p.status='published' AND c.is_active AND (b.id IS NULL OR b.is_active)
      AND (p.sku_key=normalized_sku OR p.search_document @@ search_terms)
      AND (selected_category IS NULL OR p.category_id=selected_category)
      AND (selected_brand IS NULL OR p.brand_id=selected_brand)
      AND (featured_only IS NULL OR p.is_featured=featured_only)
      AND (after_id IS NULL OR p.id>after_id)
$$;
REVOKE ALL ON FUNCTION catalog_internal.search_product_ids(TEXT,TSQUERY,UUID,UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog_internal.search_product_ids(TEXT,TSQUERY,UUID,UUID,BOOLEAN,TEXT)
    TO boticaya_catalog_app,boticaya_catalog_editor;

REVOKE ALL ON public.categories,public.brands,public.product_images FROM PUBLIC;
DO $permissions$
DECLARE api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
            EXECUTE format('REVOKE ALL ON public.categories,public.brands,public.product_images FROM %I',api_role);
        END IF;
    END LOOP;
    IF has_schema_privilege('boticaya_catalog_editor','public','CREATE') THEN
        RAISE EXCEPTION 'Unexpected indirect CREATE permission';
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO boticaya_catalog_editor',current_database());
END $permissions$;
GRANT USAGE ON SCHEMA extensions TO boticaya_catalog_app,boticaya_catalog_editor;
GRANT EXECUTE ON FUNCTION extensions.unaccent(TEXT) TO boticaya_catalog_app,boticaya_catalog_editor;
GRANT USAGE ON SCHEMA public,catalog_internal TO boticaya_catalog_app,boticaya_catalog_editor;
GRANT EXECUTE ON FUNCTION catalog_internal.normalize(TEXT),catalog_internal.search_query(TEXT) TO boticaya_catalog_app,boticaya_catalog_editor;
GRANT SELECT ON public.categories,public.brands,public.product_images TO boticaya_catalog_app;
GRANT SELECT,INSERT,UPDATE ON public.products,public.categories,public.brands TO boticaya_catalog_editor;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.product_images TO boticaya_catalog_editor;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images FORCE ROW LEVEL SECURITY;
CREATE POLICY categories_read ON public.categories FOR SELECT TO boticaya_catalog_app USING(is_active);
CREATE POLICY brands_read ON public.brands FOR SELECT TO boticaya_catalog_app USING(is_active);
CREATE POLICY images_read ON public.product_images FOR SELECT TO boticaya_catalog_app
    USING(status='published' AND EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id));
DROP POLICY catalog_api_read ON public.products;
CREATE POLICY catalog_api_read ON public.products FOR SELECT TO boticaya_catalog_app
    USING(status='published' AND EXISTS(SELECT 1 FROM public.categories c WHERE c.id=category_id AND c.is_active)
    AND (brand_id IS NULL OR EXISTS(SELECT 1 FROM public.brands b WHERE b.id=brand_id AND b.is_active)));
CREATE POLICY products_edit ON public.products TO boticaya_catalog_editor USING(true) WITH CHECK(true);
CREATE POLICY categories_edit ON public.categories TO boticaya_catalog_editor USING(true) WITH CHECK(true);
CREATE POLICY brands_edit ON public.brands TO boticaya_catalog_editor USING(true) WITH CHECK(true);
CREATE POLICY images_edit ON public.product_images TO boticaya_catalog_editor USING(true) WITH CHECK(true);
COMMIT;
