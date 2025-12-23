-- Migration to add toggle_wishlist RPC

CREATE OR REPLACE FUNCTION toggle_wishlist(p_winery_data jsonb)
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

  -- Ensure winery exists (using existing RPC logic or calling it if possible)
  -- Since ensure_winery is SECURITY DEFINER, we can call it.
  v_winery_id := ensure_winery(p_winery_data);

  -- Check if already in wishlist
  SELECT EXISTS (
    SELECT 1 FROM wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove
    DELETE FROM wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    RETURN false; -- Removed
  ELSE
    -- Add
    INSERT INTO wishlist (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    RETURN true; -- Added
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION toggle_wishlist(jsonb) TO authenticated;
