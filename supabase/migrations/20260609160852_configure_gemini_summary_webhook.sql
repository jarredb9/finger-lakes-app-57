-- Trigger function to invoke update-gemini-summary Edge Function
CREATE OR REPLACE FUNCTION public.handle_visits_gemini_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
  v_auth TEXT;
  v_secret TEXT;
  v_apikey TEXT;
BEGIN
  -- Retrieve service_role_key from Vault if present (production), otherwise default to local
  BEGIN
    SELECT decrypted_secret INTO v_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'service_role_key' 
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NOT NULL THEN
    v_url := 'https://jfsxclrdxmvftxacjuqf.supabase.co/functions/v1/update-gemini-summary';
    v_auth := 'Bearer ' || v_secret;
    v_apikey := v_secret;
  ELSE
    v_url := 'http://kong:8000/functions/v1/update-gemini-summary';
    v_auth := 'Bearer your-service-role-key';
    v_apikey := 'your-service-role-key';
  END IF;

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
    jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_apikey,
      'Authorization', v_auth
    ),
    5000
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger AFTER INSERT OR UPDATE on public.visits
CREATE OR REPLACE TRIGGER tr_visits_gemini_summary
AFTER INSERT OR UPDATE ON public.visits
FOR EACH ROW
WHEN (NEW.user_review IS NOT NULL AND length(NEW.user_review) > 100)
EXECUTE FUNCTION public.handle_visits_gemini_summary();
