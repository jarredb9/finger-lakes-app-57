-- ============================================================================
-- Migration: 20261104120000_harden_storage_and_webhooks.sql
-- Description: Hardens storage.buckets & storage.objects RLS, enforces activity_ledger
--              privacy inheritance, hardens notification webhook, audits SECURITY DEFINER
--              search_paths, and decouples profiles.email from activity RPCs.
-- ADR References: ADR-0007, ADR-0010
-- Tracking: Issue #93, Phase 3 (Green phase)
-- ============================================================================

-- 1. Private Storage & RLS Hardening (visit-photos)
-- 1.1 Bucket configuration: make private, enforce 10MB limit and MIME restrictions
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'visit-photos';

-- 1.2 GIN index on public.visits (photos) to accelerate array containment lookups
CREATE INDEX IF NOT EXISTS idx_visits_photos_gin ON public.visits USING GIN (photos);

-- 1.3 Storage objects SELECT policy: authenticate owner or viewer via is_visible_to_viewer
DROP POLICY IF EXISTS "Users can view their own and friends photos" ON storage.objects;
CREATE POLICY "Users can view their own and friends photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.photos @> ARRAY[storage.objects.name]
        AND public.is_visible_to_viewer(v.user_id, v.is_private)
    )
  )
);

-- 2. Activity Ledger Privacy Inheritance (handle_activity_ledger_entry)
CREATE OR REPLACE FUNCTION public.handle_activity_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_winery_name text;
    v_winery_id integer;
    v_winery_latitude numeric;
    v_winery_longitude numeric;
    v_privacy_level text;
    v_user_privacy text;
BEGIN
    -- Determine privacy level
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Get user's default privacy level as a fallback
        SELECT privacy_level::text INTO v_user_privacy FROM public.profiles WHERE id = NEW.user_id;
        
        IF COALESCE(NEW.is_private, false) OR v_user_privacy = 'private' THEN
            v_privacy_level := 'private';
        ELSIF v_user_privacy = 'friends_only' THEN
            v_privacy_level := 'friends_only';
        ELSE
            v_privacy_level := 'public';
        END IF;

        -- Get winery details for metadata
        SELECT id, name, latitude, longitude 
        INTO v_winery_id, v_winery_name, v_winery_latitude, v_winery_longitude 
        FROM public.wineries 
        WHERE id = NEW.winery_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'visits' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'visit', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude,
                    'rating', NEW.rating,
                    'user_review', NEW.user_review,
                    'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'favorite', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'wishlist', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                ),
                NEW.created_at
            );
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Update existing ledger entry using table-specific logic to avoid field access errors
        IF TG_TABLE_NAME = 'visits' THEN
            UPDATE public.activity_ledger
            SET 
                privacy_level = v_privacy_level,
                metadata = jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude,
                    'rating', NEW.rating,
                    'user_review', NEW.user_review,
                    'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                )
            WHERE activity_type = 'visit' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            UPDATE public.activity_ledger
            SET 
                privacy_level = v_privacy_level,
                metadata = jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                )
            WHERE activity_type = 'favorite' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            UPDATE public.activity_ledger
            SET 
                privacy_level = v_privacy_level,
                metadata = jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                )
            WHERE activity_type = 'wishlist' AND object_id = OLD.id::text;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        -- Remove ledger entry using table-specific logic
        IF TG_TABLE_NAME = 'visits' THEN
            DELETE FROM public.activity_ledger WHERE activity_type = 'visit' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            DELETE FROM public.activity_ledger WHERE activity_type = 'favorite' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            DELETE FROM public.activity_ledger WHERE activity_type = 'wishlist' AND object_id = OLD.id::text;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

ALTER FUNCTION public.handle_activity_ledger_entry() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_activity_ledger_entry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_activity_ledger_entry() TO authenticated, service_role;

-- 3. Webhook Notification Hardening (handle_activity_ledger_notification)
CREATE OR REPLACE FUNCTION public.handle_activity_ledger_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, pg_temp
AS $$
DECLARE
  v_base_url TEXT;
  v_url TEXT;
  v_auth TEXT;
  v_secret TEXT;
  v_headers JSONB;
BEGIN
  -- 1. Resolve base Supabase URL dynamically:
  -- Check Supabase Vault first, then custom setting 'app.settings.supabase_url', fallback to local kong
  BEGIN
    SELECT decrypted_secret INTO v_base_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'supabase_url' 
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_base_url := NULL;
  END;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
  END IF;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'http://kong:8000';
  END IF;

  -- Validate base URL against allowlist
  IF v_base_url !~* '^(https?://(localhost|127\.0\.0\.1|kong)(:[0-9]+)?|https://[a-zA-Z0-9_\-\.]+\.supabase\.co)$' THEN
    RAISE WARNING 'handle_activity_ledger_notification: Invalid or unallowable webhook base URL: %', v_base_url;
    RETURN NEW;
  END IF;

  -- Trim any trailing slashes and construct webhook URL
  v_url := rtrim(v_base_url, '/') || '/functions/v1/send-social-notification';

  -- 2. Resolve service role key dynamically:
  -- Check Supabase Vault first, then custom setting 'app.settings.service_role_key'
  BEGIN
    SELECT decrypted_secret INTO v_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'service_role_key' 
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    v_secret := NULLIF(current_setting('app.settings.service_role_key', true), '');
  END IF;

  -- Build authorization headers dynamically without hardcoded fallback secrets
  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_auth := 'Bearer ' || v_secret;
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_secret,
      'Authorization', v_auth
    );
  ELSE
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json'
    );
  END IF;

  -- 3. Invoke webhook asynchronously via pg_net (fail-open)
  BEGIN
    PERFORM net.http_post(
      v_url,
      jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', to_jsonb(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
      ),
      '{}'::jsonb,
      v_headers,
      5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_activity_ledger_notification: Failed to dispatch webhook: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_activity_ledger_notification() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_activity_ledger_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_activity_ledger_notification() TO service_role;

-- 4. SECURITY DEFINER Function search_path Audit
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, pg_temp;

-- 5. SECURITY INVOKER RPCs Column Privilege Decoupling (profiles.email)
-- 5.1 get_friend_activity_feed(integer)
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_feed jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(row_to_json(t))
    INTO v_feed
    FROM (
        SELECT
          al.activity_type,
          al.created_at,
          al.user_id as activity_user_id,
          COALESCE(p.name, 'Someone')::text as user_name,
          NULL::text as user_email,
          (al.metadata->>'winery_id')::integer as winery_id,
          (al.metadata->>'winery_name')::text as winery_name,
          (al.metadata->>'rating')::integer as visit_rating,
          (al.metadata->>'user_review')::text as visit_review,
          CASE 
            WHEN al.metadata->'photos' IS NOT NULL AND jsonb_typeof(al.metadata->'photos') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(al.metadata->'photos'))
            ELSE ARRAY[]::text[]
          END as visit_photos
        FROM public.activity_ledger al
        LEFT JOIN public.profiles p ON al.user_id = p.id
        WHERE 
          al.user_id != v_user_id 
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
          AND EXISTS (
            SELECT 1 FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user1_id = v_user_id AND f.user2_id = al.user_id)
                OR
                (f.user2_id = v_user_id AND f.user1_id = al.user_id)
              )
          )
        ORDER BY al.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

ALTER FUNCTION public.get_friend_activity_feed(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friend_activity_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated, service_role;

-- 5.2 get_friends_activity_for_winery(integer)
DROP FUNCTION IF EXISTS public.get_friends_activity_for_winery(integer);
CREATE OR REPLACE FUNCTION public.get_friends_activity_for_winery(
  p_winery_id integer
) RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_favorited_by json;
    v_wishlisted_by json;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN json_build_object('favoritedBy', '[]'::json, 'wishlistedBy', '[]'::json);
    END IF;

    SELECT json_agg(row_to_json(f_data))
    INTO v_favorited_by
    FROM (
        SELECT p.id, p.name, NULL::text as email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'favorite'
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
          AND EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
          )
    ) f_data;

    SELECT json_agg(row_to_json(w_data))
    INTO v_wishlisted_by
    FROM (
        SELECT p.id, p.name, NULL::text as email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'wishlist'
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
          AND EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
          )
    ) w_data;

    RETURN json_build_object(
        'favoritedBy', COALESCE(v_favorited_by, '[]'::json),
        'wishlistedBy', COALESCE(v_wishlisted_by, '[]'::json)
    );
END;
$$;

ALTER FUNCTION public.get_friends_activity_for_winery(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friends_activity_for_winery(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_activity_for_winery(integer) TO authenticated, service_role;

-- 5.3 get_friends_ratings_for_winery(integer)
DROP FUNCTION IF EXISTS public.get_friends_ratings_for_winery(integer);
CREATE OR REPLACE FUNCTION public.get_friends_ratings_for_winery(
  p_winery_id integer
) RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  rating integer,
  user_review text,
  photos text[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        p.id as user_id,
        COALESCE(p.name, 'Friend')::text as name,
        'hidden'::text as email,
        (al.metadata->>'rating')::integer as rating,
        (al.metadata->>'user_review')::text as user_review,
        CASE 
          WHEN al.metadata->'photos' IS NOT NULL AND jsonb_typeof(al.metadata->'photos') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(al.metadata->'photos'))
          ELSE ARRAY[]::text[]
        END as photos
    FROM public.activity_ledger al
    JOIN public.profiles p ON al.user_id = p.id
    WHERE al.activity_type = 'visit'
      AND (al.metadata->>'winery_id')::integer = p_winery_id
      AND al.user_id != v_user_id
      AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
      AND EXISTS (
        SELECT 1 FROM public.friends fr
        WHERE fr.status = 'accepted'
          AND (
            (fr.user1_id = v_user_id AND fr.user2_id = p.id)
            OR
            (fr.user2_id = v_user_id AND fr.user1_id = p.id)
          )
      )
    ORDER BY al.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_friends_ratings_for_winery(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friends_ratings_for_winery(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) TO authenticated, service_role;
