-- Migration: 20260902120000_parameterize_notification_webhook.sql
-- Description: Parameterize notification webhook URL and secrets via app.settings.supabase_url and Vault, drop legacy gemini summary triggers (BE-12, BE-13, BE-15).

-- ============================================================================
-- 1. Ensure legacy visits gemini summary trigger and function are dropped (BE-13)
-- ============================================================================

DROP TRIGGER IF EXISTS tr_visits_gemini_summary ON public.visits;
DROP FUNCTION IF EXISTS public.handle_visits_gemini_summary();

-- ============================================================================
-- 2. Parameterize handle_activity_ledger_notification webhook (BE-12, BE-15)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_activity_ledger_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_base_url TEXT;
  v_url TEXT;
  v_auth TEXT;
  v_secret TEXT;
  v_headers JSONB;
BEGIN
  -- 1. Resolve base Supabase URL dynamically:
  -- Check custom setting 'app.settings.supabase_url', then Supabase Vault, fallback to local kong
  v_base_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
  
  IF v_base_url IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_base_url 
      FROM vault.decrypted_secrets 
      WHERE name = 'supabase_url' 
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_base_url := NULL;
    END;
  END IF;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'http://kong:8000';
  END IF;

  -- Trim any trailing slashes and construct webhook URL
  v_url := rtrim(v_base_url, '/') || '/functions/v1/send-social-notification';

  -- 2. Resolve service role key dynamically:
  -- Check custom setting 'app.settings.service_role_key', then Supabase Vault
  v_secret := NULLIF(current_setting('app.settings.service_role_key', true), '');

  IF v_secret IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_secret 
      FROM vault.decrypted_secrets 
      WHERE name = 'service_role_key' 
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_secret := NULL;
    END;
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

  -- 3. Invoke webhook asynchronously via pg_net
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net, pg_temp;

ALTER FUNCTION public.handle_activity_ledger_notification() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_activity_ledger_notification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_activity_ledger_notification() TO authenticated, service_role;

-- Recreate or ensure trigger is properly attached
DROP TRIGGER IF EXISTS tr_activity_ledger_notification ON public.activity_ledger;
CREATE TRIGGER tr_activity_ledger_notification
AFTER INSERT ON public.activity_ledger
FOR EACH ROW
EXECUTE FUNCTION public.handle_activity_ledger_notification();
