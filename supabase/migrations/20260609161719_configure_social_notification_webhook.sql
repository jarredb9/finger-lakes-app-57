-- Trigger function to invoke send-social-notification Edge Function
CREATE OR REPLACE FUNCTION public.handle_activity_ledger_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
  v_auth TEXT;
  v_secret TEXT;
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
    v_url := 'https://jfsxclrdxmvftxacjuqf.supabase.co/functions/v1/send-social-notification';
    v_auth := 'Bearer ' || v_secret;
  ELSE
    v_url := 'http://kong:8000/functions/v1/send-social-notification';
    v_auth := 'Bearer your-service-role-key';
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', v_auth
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger AFTER INSERT on public.activity_ledger
CREATE OR REPLACE TRIGGER tr_activity_ledger_notification
AFTER INSERT ON public.activity_ledger
FOR EACH ROW
EXECUTE FUNCTION public.handle_activity_ledger_notification();
