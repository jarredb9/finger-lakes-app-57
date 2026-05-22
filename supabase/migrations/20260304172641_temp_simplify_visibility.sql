-- Temporary simplification to isolate the issue
CREATE OR REPLACE FUNCTION public.is_visible_to_viewer(p_target_user_id uuid, p_is_item_private boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER;
 SET search_path = public, auth
AS $$
BEGIN
    IF p_is_item_private THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;
