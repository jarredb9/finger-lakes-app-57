-- Migration to add RPCs for toggling privacy on favorites and wishlist items
-- Sequential timestamp: 20260302160347

-- RPC to toggle favorite privacy
CREATE OR REPLACE FUNCTION public.toggle_favorite_privacy(p_winery_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_new_state boolean;
BEGIN
    UPDATE public.favorites
    SET is_private = NOT is_private,
        created_at = created_at -- dummy to trigger update if needed
    WHERE user_id = v_user_id AND winery_id = p_winery_id
    RETURNING is_private INTO v_new_state;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Favorite item not found for this user';
    END IF;

    RETURN jsonb_build_object('success', true, 'is_private', v_new_state);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_favorite_privacy(integer) TO authenticated;

-- RPC to toggle wishlist privacy
CREATE OR REPLACE FUNCTION public.toggle_wishlist_privacy(p_winery_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_new_state boolean;
BEGIN
    UPDATE public.wishlist
    SET is_private = NOT is_private,
        created_at = created_at
    WHERE user_id = v_user_id AND winery_id = p_winery_id
    RETURNING is_private INTO v_new_state;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wishlist item not found for this user';
    END IF;

    RETURN jsonb_build_object('success', true, 'is_private', v_new_state);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_wishlist_privacy(integer) TO authenticated;
