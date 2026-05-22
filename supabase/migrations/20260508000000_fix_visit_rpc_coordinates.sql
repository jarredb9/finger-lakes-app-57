-- Migration: 20260508000000_fix_visit_rpc_coordinates.sql
-- Goal: Ensure 'latitude' and 'longitude' are present in all visit-related RPCs and activity ledger metadata.

-- 1. Update update_visit to include coordinates in return object
CREATE OR REPLACE FUNCTION public.update_visit(
    p_visit_id integer,
    p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER;
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_updated_record record;
BEGIN
    UPDATE public.visits
    SET 
        visit_date = COALESCE((p_visit_data->>'visit_date')::date, visit_date),
        user_review = COALESCE(p_visit_data->>'user_review', user_review),
        rating = COALESCE((p_visit_data->>'rating')::integer, rating),
        photos = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') x), photos),
        is_private = COALESCE((p_visit_data->>'is_private')::boolean, is_private),
        updated_at = NOW()
    WHERE id = p_visit_id AND user_id = v_user_id
    RETURNING * INTO v_updated_record;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'id', v.id,
            'user_id', v.user_id,
            'visit_date', v.visit_date,
            'rating', v.rating,
            'user_review', v.user_review,
            'photos', v.photos,
            'is_private', v.is_private,
            'winery_id', v.winery_id,
            'winery_name', w.name,
            'winery_address', w.address,
            'google_place_id', w.google_place_id,
            'latitude', w.latitude,
            'longitude', w.longitude,
            'lat', w.latitude,
            'lng', w.longitude
        )
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        WHERE v.id = v_updated_record.id
    );
END;
$$;

-- 2. Update get_friend_profile_with_visits to include winery coordinates
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(friend_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER;
SET search_path = public, auth
AS $$
DECLARE
    v_profile jsonb;
    v_viewer_id uuid := auth.uid();
BEGIN
    -- 1. Check if the viewer is allowed to see the profile at all
    IF NOT public.is_visible_to_viewer(friend_id_param, false) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- 2. Build the profile object
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'visits', (
            -- Only return visits visible to the current viewer
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'winery', jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address,
                        'latitude', w.latitude,
                        'longitude', w.longitude,
                        'lat', w.latitude,
                        'lng', w.longitude
                    )
                ) ORDER BY v.visit_date DESC
            ), '[]'::jsonb)
            FROM public.visits v
            JOIN public.wineries w ON v.winery_id = w.id
            WHERE v.user_id = friend_id_param 
              AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
        ),
        'stats', (
            SELECT jsonb_build_object(
                'visit_count', (
                    SELECT count(*)::int 
                    FROM public.visits v 
                    WHERE v.user_id = friend_id_param 
                      AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
                ),
                'wishlist_count', (
                    SELECT count(*)::int 
                    FROM public.wishlist wl 
                    WHERE wl.user_id = friend_id_param 
                      AND (wl.user_id = v_viewer_id OR public.is_visible_to_viewer(wl.user_id, wl.is_private))
                ),
                'favorite_count', (
                    SELECT count(*)::int 
                    FROM public.favorites f 
                    WHERE f.user_id = friend_id_param 
                      AND (f.user_id = v_viewer_id OR public.is_visible_to_viewer(f.user_id, f.is_private))
                )
            )
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = friend_id_param;

    RETURN v_profile;
END;
$$;

-- 3. Update get_user_dashboard to include coordinates in recent_visits
CREATE OR REPLACE FUNCTION public.get_user_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER;
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN;
    SELECT jsonb_build_object(
        'profile', (;
            SELECT to_jsonb(p) - 'email' FROM profiles p WHERE p.id = v_user_id
        ),
        'friend_requests_received', (;
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'requester_id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = v_user_id AND f.status = 'pending'
        ),
        'friend_requests_sent', (;
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'receiver_id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        ),
        'upcoming_trips', (;
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'trip_date', t.trip_date
                )
            ORDER BY t.trip_date ASC), '[]'::jsonb)
            FROM trips t
            WHERE (
                t.user_id = v_user_id 
                OR EXISTS (;
                    SELECT 1 FROM trip_members tm 
                    WHERE tm.trip_id = t.id AND tm.user_id = v_user_id
                )
            ) 
            AND t.trip_date >= CURRENT_DATE
        ),
        'recent_visits', (;
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'winery_id', v.winery_id,
                    'winery_name', w.name,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'lat', w.latitude,
                    'lng', w.longitude
                )
            ORDER BY v.visit_date DESC), '[]'::jsonb)
            FROM visits v
            JOIN wineries w ON v.winery_id = w.id
            WHERE v.user_id = v_user_id
            LIMIT 5 
        )
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

-- 4. Update get_user_winery_data_aggregated to use standard coordinate names
CREATE OR REPLACE FUNCTION public.get_user_winery_data_aggregated()
RETURNS TABLE (wineries_data jsonb) AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', w.google_place_id,
                'dbId', w.id,
                'name', w.name,
                'address', w.address,
                'latitude', w.latitude,
                'longitude', w.longitude,
                'lat', w.latitude,
                'lng', w.longitude,
                'phone', w.phone,
                'website', w.website,
                'rating', w.google_rating,
                'isFavorite', EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid),
                'onWishlist', EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid),
                'userVisited', EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid),
                'visits', (
                    SELECT COALESCE(jsonb_agg(
                        jsonb_build_object(
                            'id', v.id,
                            'visit_date', v.visit_date,
                            'rating', v.rating,
                            'user_review', v.user_review,
                            'photos', v.photos
                        ) ORDER BY v.visit_date DESC
                    ), '[]'::jsonb)
                    FROM visits v
                    WHERE v.winery_id = w.id AND v.user_id = user_uuid
                ),
                'tripInfo', (
                    SELECT COALESCE(jsonb_agg(
                        jsonb_build_object(
                            'trip_id', t.id,
                            'trip_name', t.name,
                            'trip_date', t.trip_date,
                            'notes', tw.notes,
                            'visit_order', tw.visit_order
                        ) ORDER BY t.trip_date ASC, tw.visit_order ASC
                    ), '[]'::jsonb)
                    FROM trip_wineries tw
                    JOIN trips t ON tw.trip_id = t.id
                    WHERE tw.winery_id = w.id 
                    AND (
                        t.user_id = user_uuid 
                        OR EXISTS (
                            SELECT 1 FROM trip_members tm 
                            WHERE tm.trip_id = t.id AND tm.user_id = user_uuid
                        )
                    )
                    AND t.trip_date >= CURRENT_DATE -- Only upcoming trips
                )
            )
        ), '[]'::jsonb)
    FROM
        wineries w
    WHERE
        -- Filter for wineries relevant to the current user
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM trip_wineries tw JOIN trips t ON tw.trip_id = t.id
                  WHERE tw.winery_id = w.id 
                  AND (
                      t.user_id = user_uuid 
                      OR EXISTS (
                          SELECT 1 FROM trip_members tm 
                          WHERE tm.trip_id = t.id AND tm.user_id = user_uuid
                      )
                  )
                  AND t.trip_date >= CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update handle_activity_ledger_entry trigger function to include coordinates in metadata
CREATE OR REPLACE FUNCTION public.handle_activity_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER;
SET search_path = public
AS $$
DECLARE
    v_winery_name text;
    v_winery_id integer;
    v_winery_latitude numeric;
    v_winery_longitude numeric;
    v_privacy_level text;
    v_user_privacy text;
BEGIN
    -- Determine privacy level
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Get user's default privacy level as a fallback
        SELECT privacy_level::text INTO v_user_privacy FROM public.profiles WHERE id = NEW.user_id;
        
        IF NEW.is_private THEN
            v_privacy_level := 'private';
        ELSIF v_user_privacy = 'friends_only' THEN
            v_privacy_level := 'friends_only';
        ELSE
            v_privacy_level := 'public';
        END IF;

        -- Get winery details for metadata
        SELECT id, name, latitude, longitude 
        INTO v_winery_id, v_winery_name, v_winery_latitude, v_winery_longitude 
        FROM public.wineries 
        WHERE id = NEW.winery_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'visits' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'visit', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude,
                    'rating', NEW.rating,
                    'user_review', NEW.user_review,
                    'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'favorite', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'wishlist', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                ),
                NEW.created_at
            );
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Update existing ledger entry
        UPDATE public.activity_ledger
        SET 
            privacy_level = v_privacy_level,
            metadata = CASE 
                WHEN TG_TABLE_NAME = 'visits' THEN 
                    jsonb_build_object(
                        'winery_id', v_winery_id,
                        'winery_name', v_winery_name,
                        'latitude', v_winery_latitude,
                        'longitude', v_winery_longitude,
                        'lat', v_winery_latitude,
                        'lng', v_winery_longitude,
                        'rating', NEW.rating,
                        'user_review', NEW.user_review,
                        'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                    )
                ELSE 
                    jsonb_build_object(
                        'winery_id', v_winery_id,
                        'winery_name', v_winery_name,
                        'latitude', v_winery_latitude,
                        'longitude', v_winery_longitude,
                        'lat', v_winery_latitude,
                        'lng', v_winery_longitude
                    )
            END
        WHERE activity_type = CASE 
                WHEN TG_TABLE_NAME = 'visits' THEN 'visit'
                WHEN TG_TABLE_NAME = 'favorites' THEN 'favorite'
                WHEN TG_TABLE_NAME = 'wishlist' THEN 'wishlist'
            END
          AND object_id = OLD.id::text;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        -- Remove ledger entry
        DELETE FROM public.activity_ledger
        WHERE activity_type = CASE 
                WHEN TG_TABLE_NAME = 'visits' THEN 'visit'
                WHEN TG_TABLE_NAME = 'favorites' THEN 'favorite'
                WHEN TG_TABLE_NAME = 'wishlist' THEN 'wishlist'
            END
          AND object_id = OLD.id::text;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;
