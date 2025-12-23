-- Migration to add send_friend_request and respond_to_friend_request RPCs

-- send_friend_request
CREATE OR REPLACE FUNCTION send_friend_request(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  target_user_id uuid;
  existing_request record;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lookup target user by email (case insensitive)
  SELECT id INTO target_user_id
  FROM profiles
  WHERE email ILIKE TRIM(target_email);

  IF target_user_id IS NULL THEN
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
      -- Force user1_id to be ME (requester), user2_id to be THEM
      UPDATE friends
      SET status = 'pending',
          user1_id = current_user_id,
          user2_id = target_user_id,
          updated_at = NOW()
      WHERE id = existing_request.id;
      
      RETURN;
    END IF;
  END IF;

  -- Insert new request
  INSERT INTO friends (user1_id, user2_id, status)
  VALUES (current_user_id, target_user_id, 'pending');

END;
$$;

-- respond_to_friend_request
CREATE OR REPLACE FUNCTION respond_to_friend_request(requester_id uuid, accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  new_status text;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF accept THEN
    new_status := 'accepted';
  ELSE
    new_status := 'declined';
  END IF;

  UPDATE friends
  SET status = new_status,
      updated_at = NOW()
  WHERE user1_id = requester_id
    AND user2_id = current_user_id
    AND status = 'pending';

END;
$$;
