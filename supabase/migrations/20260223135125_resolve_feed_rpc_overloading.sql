-- 1. Drop both known overloaded signatures
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer, uuid);

-- 2. Recreate the function
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS TABLE (
  activity_type text,
  created_at timestamptz,
  activity_user_id uuid,
  user_name text,
  user_email text,
  winery_id int,
  winery_name text,
  visit_rating int,
  visit_review text,
  visit_photos text[]
)
LANGUAGE plpgsql
SECURITY DEFINER;
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
      'visit'::text as activity_type,
      v.created_at,
      v.user_id as activity_user_id,
      COALESCE(p.name, 'Someone')::text as user_name,
      COALESCE(p.email, 'unknown')::text as user_email,
      w.id as winery_id,
      w.name::text as winery_name,
      v.rating as visit_rating,
      v.user_review as visit_review,
      COALESCE(v.photos, ARRAY[]::text[]) as visit_photos
    FROM public.visits v
    JOIN public.wineries w ON v.winery_id = w.id
    LEFT JOIN public.profiles p ON v.user_id = p.id
    WHERE 
      EXISTS (
        SELECT 1 FROM public.friends f
        WHERE f.status = 'accepted'
          AND (
            (f.user1_id = v_caller_id AND f.user2_id = v.user_id)
            OR
            (f.user2_id = v_caller_id AND f.user1_id = v.user_id)
          )
      )
      OR v.user_id = v_caller_id
    ORDER BY v.created_at DESC
    LIMIT limit_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated;