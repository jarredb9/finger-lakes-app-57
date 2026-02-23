-- Create a debug log table for social feed investigations
CREATE TABLE IF NOT EXISTS public.feed_debug_logs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    caller_id UUID,
    friend_ids UUID[],
    results_count INTEGER,
    message TEXT
);

-- Grant access to the debug log
GRANT ALL ON public.feed_debug_logs TO authenticated;
GRANT ALL ON public.feed_debug_logs TO service_role;

-- Update get_friend_activity_feed with deep logging
CREATE OR REPLACE FUNCTION get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS TABLE (
  activity_type text,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  user_email text,
  winery_id int,
  winery_name text,
  visit_rating int,
  visit_review text,
  visit_photos text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_friend_ids UUID[];
BEGIN
    v_caller_id := auth.uid();
    
    -- Identify friends
    SELECT ARRAY(
        SELECT
          CASE
            WHEN f.user1_id = v_caller_id THEN f.user2_id
            ELSE f.user1_id
          END
        FROM friends f
        WHERE (f.user1_id = v_caller_id OR f.user2_id = v_caller_id)
          AND f.status = 'accepted'
    ) INTO v_friend_ids;

    -- Log the attempt
    INSERT INTO public.feed_debug_logs (caller_id, friend_ids, message)
    VALUES (v_caller_id, v_friend_ids, 'Fetching feed for user');

    RETURN QUERY
    SELECT
      'visit'::text as activity_type,
      v.created_at,
      v.user_id,
      COALESCE(p.name, 'Someone')::text as user_name,
      COALESCE(p.email, 'unknown')::text as user_email,
      w.id as winery_id,
      w.name::text as winery_name,
      v.rating as visit_rating,
      v.user_review as visit_review,
      COALESCE(v.photos, ARRAY[]::text[]) as visit_photos
    FROM visits v
    JOIN wineries w ON v.winery_id = w.id
    LEFT JOIN profiles p ON v.user_id = p.id
    WHERE v.user_id = ANY(v_friend_ids)
    ORDER BY v.created_at DESC
    LIMIT limit_val;

    -- Update the log with results count
    UPDATE public.feed_debug_logs 
    SET results_count = (SELECT COUNT(*)::int FROM visits WHERE user_id = ANY(v_friend_ids))
    WHERE id = (SELECT max(id) FROM public.feed_debug_logs WHERE caller_id = v_caller_id);
END;
$$;
