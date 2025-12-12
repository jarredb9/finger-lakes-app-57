-- RPC to remove a friend (delete the friendship record)
CREATE OR REPLACE FUNCTION remove_friend(target_friend_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    DELETE FROM friends
    WHERE (user1_id = current_user_id AND user2_id = target_friend_id)
       OR (user1_id = target_friend_id AND user2_id = current_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION remove_friend(UUID) TO authenticated;
