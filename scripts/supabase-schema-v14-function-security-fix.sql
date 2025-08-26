-- This script corrects the security context of the get_friends_ids function,
-- which is the final fix needed for the friends' ratings feature to work.

-- Re-create the function WITHOUT "SECURITY DEFINER" to ensure it runs
-- as the currently logged-in user (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION get_friends_ids()
RETURNS TABLE(friend_id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN user1_id = auth.uid() THEN user2_id
            ELSE user1_id
        END
    FROM
        public.friends
    WHERE
        (user1_id = auth.uid() OR user2_id = auth.uid()) AND status = 'accepted';
END;
$$ LANGUAGE plpgsql; -- Note: SECURITY DEFINER has been removed

-- The RLS policy and GRANT EXECUTE statements from before are still correct
-- and do not need to be changed. This function recreation is the only required step.