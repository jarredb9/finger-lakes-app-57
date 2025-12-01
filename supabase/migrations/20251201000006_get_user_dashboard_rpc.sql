-- Mega-RPC to aggregate user dashboard data in a single call.
-- Returns profile, friend requests, upcoming trips, and recent visits.

CREATE OR REPLACE FUNCTION get_user_dashboard()
RETURNS jsonb AS $$
DECLARE
    user_id uuid := auth.uid();
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'profile', (
            SELECT to_jsonb(p) - 'email' FROM profiles p WHERE p.id = user_id
        ),
        'friend_requests_received', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'requester_id', p.id,
                    'name', p.name,
                    'email', p.email,
                    'status', f.status
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = user_id AND f.status = 'pending'
        ),
        'friend_requests_sent', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'recipient_id', p.id,
                    'name', p.name,
                    'email', p.email,
                    'status', f.status
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = user_id AND f.status = 'pending'
        ),
        'upcoming_trips', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'trip_date', t.trip_date
                )
            ORDER BY t.trip_date ASC), '[]'::jsonb)
            FROM trips t
            WHERE (t.user_id = user_id OR user_id = ANY(t.members)) AND t.trip_date >= CURRENT_DATE
        ),
        'recent_visits', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'winery_id', v.winery_id,
                    'winery_name', w.name,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos
                )
            ORDER BY v.visit_date DESC), '[]'::jsonb)
            FROM visits v
            JOIN wineries w ON v.winery_id = w.id
            WHERE v.user_id = user_id
            LIMIT 5 -- Limit to a reasonable number of recent visits
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_dashboard() TO authenticated;
