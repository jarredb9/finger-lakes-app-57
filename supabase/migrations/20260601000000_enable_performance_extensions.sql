-- Migration: Enable Performance Extensions (hypopg, index_advisor) and Realtime Triggers
-- Track: places-v1-refactor-enrichment
-- Reason: Align local schema with remote project state discovered during CI audit.

CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";

-- Codify discovered "Ghost Drift" in realtime schema
-- This prevents the CI from attempting to DROP these objects in production.

-- Codify discovered "Ghost Drift" in realtime schema
-- This prevents the CI from attempting to DROP these objects in production.

DO $$
BEGIN
    -- Attempt to create schema, skip if permission denied or already exists
    BEGIN
        CREATE SCHEMA IF NOT EXISTS "realtime";
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privilege to create schema "realtime", skipping schema creation.';
    END;

    -- Only proceed with function/trigger creation if we have CREATE privilege on the schema
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'realtime') AND has_schema_privilege('realtime', 'CREATE') THEN
        
        -- Check for function existence without using regnamespace to avoid permission traps
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'realtime' 
            AND p.proname = 'subscription_check_filters'
        ) THEN
            CREATE FUNCTION realtime.subscription_check_filters()
             RETURNS trigger
             LANGUAGE plpgsql
            AS $function$
                /*
                Validates that the user defined filters for a subscription:
                - refer to valid columns that the claimed role may access
                - values are coercable to the correct column type
                */
                declare
                    col_names text[] = coalesce(
                            array_agg(c.column_name order by c.ordinal_position),
                            '{}'::text[]
                        )
                        from
                            information_schema.columns c
                        where
                            format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                            and pg_catalog.has_column_privilege(
                                (new.claims ->> 'role'),
                                format('%I.%I', c.table_schema, c.table_name)::regclass,
                                c.column_name,
                                'SELECT'
                            );
                    filter realtime.user_defined_filter;
                    col_type regtype;

                    in_val jsonb;
                begin
                    for filter in select * from unnest(new.filters) loop
                        -- Filtered column is valid
                        if not filter.column_name = any(col_names) then
                            raise exception 'invalid column for filter %', filter.column_name;
                        end if;

                        -- Type is sanitized and safe for string interpolation
                        col_type = (
                            select atttypid::regtype
                            from pg_catalog.pg_attribute
                            where attrelid = new.entity
                                  and attname = filter.column_name
                        );
                        if col_type is null then
                            raise exception 'failed to lookup type for column %', filter.column_name;
                        end if;

                        -- Set maximum number of entries for in filter
                        if filter.op = 'in'::realtime.equality_op then
                            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                                raise exception 'too many values for `in` filter. Maximum 100';
                            end if;
                        else
                            -- raises an exception if value is not coercable to type
                            perform realtime.cast(filter.value, col_type);
                        end if;

                    end loop;

                    -- Apply consistent order to filters so the unique constraint on
                    -- (subscription_id, entity, filters) can't be tricked by a different filter order
                    new.filters = coalesce(
                        array_agg(f order by f.column_name, f.op, f.value),
                        '{}'
                    ) from unnest(new.filters) f;

                    return new;
                end;
            $function$;
        END IF;

        -- Trigger for subscription filter validation
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_check_filters') THEN
            CREATE TRIGGER tr_check_filters 
            BEFORE INSERT OR UPDATE ON realtime.subscription 
            FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();
        END IF;
    ELSE
        RAISE NOTICE 'Skipping realtime function/trigger creation due to missing schema or privileges.';
    END IF;
END $$;
