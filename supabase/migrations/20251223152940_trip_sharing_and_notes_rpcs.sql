-- RPCs for trip sharing by email and winery note management.

-- 1. add_trip_member_by_email
-- SECURITY DEFINER is required to look up user IDs by email in the profiles table.
CREATE OR REPLACE FUNCTION add_trip_member_by_email(
    p_trip_id integer,
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_target_user_id uuid;
    v_is_owner boolean;
BEGIN
    -- 1. Verify caller is the trip owner (Only owners can add members for now)
    SELECT (user_id = v_user_id) INTO v_is_owner
    FROM trips
    WHERE id = p_trip_id;

    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Only trip owners can add new members';
    END IF;

    -- 2. Find target user by email
    SELECT id INTO v_target_user_id
    FROM profiles
    WHERE email ILIKE TRIM(p_email);

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', p_email;
    END IF;

    -- 3. Check if already a member
    IF EXISTS (
        SELECT 1 FROM trips 
        WHERE id = p_trip_id AND v_target_user_id = ANY(members)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'User is already a member');
    END IF;

    -- 4. Add member to the array
    UPDATE trips
    SET members = array_append(members, v_target_user_id)
    WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true, 'user_id', v_target_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION add_trip_member_by_email(integer, text) TO authenticated;

-- 2. update_trip_winery_notes
CREATE OR REPLACE FUNCTION update_trip_winery_notes(
    p_trip_id integer,
    p_winery_id integer,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_authorized boolean;
BEGIN
    -- 1. Verify authorization (Owner or Member)
    SELECT EXISTS (
        SELECT 1 FROM trips 
        WHERE id = p_trip_id AND (user_id = v_user_id OR v_user_id = ANY(members))
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Not authorized to modify this trip';
    END IF;

    -- 2. Update notes
    UPDATE trip_wineries
    SET notes = p_notes
    WHERE trip_id = p_trip_id AND winery_id = p_winery_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_trip_winery_notes(integer, integer, text) TO authenticated;
