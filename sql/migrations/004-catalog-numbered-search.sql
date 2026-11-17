BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $extension_location$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
        WHERE e.extname='pg_trgm' AND n.nspname='extensions') THEN
        RAISE EXCEPTION 'Review pg_trgm extension schema before migration';
    END IF;
END $extension_location$;
ALTER TABLE public.products ADD COLUMN search_text TEXT;

CREATE FUNCTION catalog_internal.prepare_catalog_text() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
    NEW.search_text := catalog_internal.normalize(concat_ws(' ',NEW.sku,NEW.name,NEW.brand,
        NEW.category,NEW.presentation,array_to_string(NEW.keywords,' ')));
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION catalog_internal.prepare_catalog_text() FROM PUBLIC;
CREATE TRIGGER z_prepare_catalog_text BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION catalog_internal.prepare_catalog_text();
UPDATE public.products SET name=name;
ALTER TABLE public.products ALTER COLUMN search_text SET NOT NULL;
CREATE INDEX products_search_text_gin ON public.products
    USING GIN(search_text extensions.gin_trgm_ops) WHERE status='published';

CREATE FUNCTION catalog_internal.catalog_product_ids(
    normalized_query TEXT, selected_categories UUID[], featured_only BOOLEAN, in_stock_only BOOLEAN
) RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
SET pg_trgm.word_similarity_threshold='0.6' AS $$
    WITH direct AS MATERIALIZED (
        SELECT p.id FROM public.products p JOIN public.categories c ON c.id=p.category_id
        LEFT JOIN public.brands b ON b.id=p.brand_id
        WHERE p.status='published' AND c.is_active AND (b.id IS NULL OR b.is_active)
          AND (selected_categories IS NULL OR p.category_id=ANY(selected_categories))
          AND (featured_only IS NULL OR p.is_featured=featured_only)
          AND (in_stock_only IS NULL OR (p.available_quantity>0)=in_stock_only)
          AND (normalized_query IS NULL OR p.sku_key=normalized_query
            OR p.search_document @@ catalog_internal.search_query(normalized_query)
            OR p.search_text LIKE '%' || replace(replace(replace(normalized_query,'\','\\'),'%','\%'),'_','\_') || '%' ESCAPE '\')
    ) SELECT id FROM direct
    UNION ALL
    SELECT p.id FROM public.products p JOIN public.categories c ON c.id=p.category_id
    LEFT JOIN public.brands b ON b.id=p.brand_id
    WHERE normalized_query IS NOT NULL AND NOT EXISTS(SELECT 1 FROM direct)
      AND p.status='published' AND c.is_active AND (b.id IS NULL OR b.is_active)
      AND (selected_categories IS NULL OR p.category_id=ANY(selected_categories))
      AND (featured_only IS NULL OR p.is_featured=featured_only)
      AND (in_stock_only IS NULL OR (p.available_quantity>0)=in_stock_only)
      AND p.search_text OPERATOR(extensions.%>) normalized_query
$$;
REVOKE ALL ON FUNCTION catalog_internal.catalog_product_ids(TEXT,UUID[],BOOLEAN,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog_internal.catalog_product_ids(TEXT,UUID[],BOOLEAN,BOOLEAN)
    TO boticaya_catalog_app,boticaya_catalog_editor;
COMMIT;
