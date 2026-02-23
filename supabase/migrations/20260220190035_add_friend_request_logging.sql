-- Harden send_friend_request with logging
CREATE OR REPLACE FUNCTION send_friend_request(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  target_user_id uuid;
  existing_request record;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  -- Log entry
  INSERT INTO public.feed_debug_logs (caller_id, message)
  VALUES (current_user_id, 'Attempting to send friend request to: ' || target_email);

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lookup target user by email (case insensitive)
  SELECT id INTO target_user_id
  FROM profiles
  WHERE email ILIKE TRIM(target_email);

  IF target_user_id IS NULL THEN
    INSERT INTO public.feed_debug_logs (caller_id, message)
    VALUES (current_user_id, 'User not found: ' || target_email);
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF target_user_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a friend.';
  END IF;

  -- Check for existing relationship in EITHER direction
  SELECT * INTO existing_request
  FROM friends
  WHERE (user1_id = current_user_id AND user2_id = target_user_id)
     OR (user1_id = target_user_id AND user2_id = current_user_id)
  LIMIT 1;

  IF existing_request.id IS NOT NULL THEN
    IF existing_request.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends.';
    ELSIF existing_request.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already sent or pending.';
    ELSE
      -- Revive the existing row (declined or other)
      UPDATE friends
      SET status = 'pending',
          user1_id = current_user_id,
          user2_id = target_user_id,
          updated_at = NOW()
      WHERE id = existing_request.id;
      
      INSERT INTO public.feed_debug_logs (caller_id, friend_ids, message)
      VALUES (current_user_id, ARRAY[target_user_id], 'Revived pending request');
      RETURN;
    END IF;
  END IF;

  -- Insert new request
  INSERT INTO friends (user1_id, user2_id, status)
  VALUES (current_user_id, target_user_id, 'pending');

  INSERT INTO public.feed_debug_logs (caller_id, friend_ids, message)
  VALUES (current_user_id, ARRAY[target_user_id], 'Created new pending request');

END;
$$;
