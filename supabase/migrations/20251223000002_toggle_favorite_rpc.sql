-- Migration to add toggle_favorite RPC

CREATE OR REPLACE FUNCTION toggle_favorite(p_winery_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_winery_id integer;
  v_exists boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ensure winery exists
  v_winery_id := ensure_winery(p_winery_data);

  -- Check if already a favorite
  SELECT EXISTS (
    SELECT 1 FROM favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove
    DELETE FROM favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    RETURN false; -- Removed
  ELSE
    -- Add
    INSERT INTO favorites (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    RETURN true; -- Added
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION toggle_favorite(jsonb) TO authenticated;
