CREATE TABLE public.favorites (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, winery_id integer NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.friends (id SERIAL PRIMARY KEY, user1_id uuid NOT NULL, user2_id uuid NOT NULL, status text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.profiles (id uuid NOT NULL, name text, email text, PRIMARY KEY (id));
CREATE TABLE public.trip_wineries (id SERIAL PRIMARY KEY, trip_id integer NOT NULL, winery_id integer NOT NULL, visit_order integer NOT NULL, created_at timestamp with time zone DEFAULT now(), notes text);
CREATE TABLE public.trips (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, trip_date date NOT NULL, name character varying(255), created_at timestamp with time zone DEFAULT now(), members uuid[]);
CREATE TABLE public.visits (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, winery_id integer NOT NULL, visit_date date NOT NULL, user_review text, rating integer, photos text[], created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.wineries (id SERIAL PRIMARY KEY, google_place_id text, name character varying(255) NOT NULL, address text NOT NULL, latitude numeric, longitude numeric, phone character varying(20), website character varying(255), google_rating numeric, created_at timestamp with time zone DEFAULT now(), opening_hours jsonb, reviews jsonb, reservable boolean);
CREATE TABLE public.wishlist (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, winery_id integer NOT NULL, created_at timestamp with time zone DEFAULT now());

ALTER TABLE public.visits ADD CONSTRAINT visits_winery_id_fkey FOREIGN KEY (winery_id) REFERENCES public.wineries(id);
ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_winery_id_fkey FOREIGN KEY (winery_id) REFERENCES public.wineries(id);
ALTER TABLE public.favorites ADD CONSTRAINT favorites_winery_id_fkey FOREIGN KEY (winery_id) REFERENCES public.wineries(id);
ALTER TABLE public.trip_wineries ADD CONSTRAINT trip_wineries_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id);
ALTER TABLE public.trip_wineries ADD CONSTRAINT trip_wineries_winery_id_fkey FOREIGN KEY (winery_id) REFERENCES public.wineries(id);
ALTER TABLE public.friends ADD CONSTRAINT friends_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.profiles(id);
ALTER TABLE public.friends ADD CONSTRAINT friends_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.profiles(id);
ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.trips ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE public.visits ADD CONSTRAINT visits_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public.friends ADD CONSTRAINT friends_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'blocked'::text])));

ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_id_winery_id_key UNIQUE (winery_id, user_id);
ALTER TABLE public.friends ADD CONSTRAINT friends_user1_id_user2_id_key UNIQUE (user1_id, user2_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
ALTER TABLE public.trip_wineries ADD CONSTRAINT trip_wineries_trip_id_winery_id_key UNIQUE (trip_id, winery_id);
ALTER TABLE public.wineries ADD CONSTRAINT wineries_google_place_id_key UNIQUE (google_place_id);
ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_user_id_winery_id_key UNIQUE (winery_id, user_id);

CREATE INDEX idx_visits_user_id ON public.visits USING btree (user_id);
CREATE INDEX idx_trips_user_id_trip_date ON public.trips USING btree (user_id, trip_date);
CREATE INDEX idx_trip_wineries_trip_id ON public.trip_wineries USING btree (trip_id);
CREATE INDEX idx_wishlist_user_id ON public.wishlist USING btree (user_id);
CREATE INDEX idx_favorites_user_id ON public.favorites USING btree (user_id);
CREATE INDEX idx_wineries_google_place_id ON public.wineries USING btree (google_place_id);

-- RLS Policies and Functions

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
    FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile." ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email)
    VALUES (new.id, new.raw_user_meta_data->>'name', new.email);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own friendships" ON public.friends
    FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can create friend requests" ON public.friends
    FOR INSERT WITH CHECK (auth.uid() = user1_id);
CREATE POLICY "Users can respond to friend requests" ON public.friends
    FOR UPDATE USING (auth.uid() = user2_id) WITH CHECK (status IN ('accepted', 'declined'));
CREATE POLICY "Users can delete their own friendships" ON public.friends
    FOR DELETE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

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
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_friends_ids() TO authenticated;

CREATE POLICY "Users can view their own and their friends' visits" ON public.visits
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trips" ON public.trips
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = ANY(members));
CREATE POLICY "Users can update their own trips" ON public.trips
    FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = ANY(members));

ALTER TABLE public.trip_wineries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_trip_member(trip_id_to_check int)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.trips
        WHERE id = trip_id_to_check
          AND (auth.uid() = user_id OR auth.uid() = ANY(members))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_trip_member(int) TO authenticated;

CREATE POLICY "Trip members can view trip wineries" ON public.trip_wineries
    FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY "Trip members can add wineries to a trip" ON public.trip_wineries
    FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY "Trip members can update wineries on a trip" ON public.trip_wineries
    FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY "Trip members can remove wineries from a trip" ON public.trip_wineries
    FOR DELETE USING (is_trip_member(trip_id));

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own and friends' favorites" ON public.favorites
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own and friends' wishlist items" ON public.wishlist
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

-- Missing RLS Policies

-- favorites
CREATE POLICY "Users can delete their own favorite items" ON public.favorites FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own favorite items" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

-- trips
CREATE POLICY "Users can delete their own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);

-- visits
CREATE POLICY "Users can delete their own visits" ON public.visits FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own visits" ON public.visits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own visits" ON public.visits FOR UPDATE USING (auth.uid() = user_id);

-- wineries
ALTER TABLE public.wineries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view wineries" ON public.wineries FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert wineries" ON public.wineries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update wineries" ON public.wineries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- wishlist
CREATE POLICY "Users can delete their own wishlist items" ON public.wishlist FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own wishlist items" ON public.wishlist FOR INSERT WITH CHECK (auth.uid() = user_id);


-- Storage Policies

-- Don't forget to create the 'visit-photos' bucket in your Supabase storage!

CREATE POLICY "User can upload a photo to a visit"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'visit-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "User can see their own photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'visit-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "User can delete their own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'visit-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RPC Functions

CREATE OR REPLACE FUNCTION get_friends_activity_for_winery(winery_id_param integer)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    friends_list UUID[];
    favorited_by_list JSON[];
    wishlisted_by_list JSON[];
BEGIN
    -- Get the current user's friends
    SELECT ARRAY(
        SELECT
            CASE
                WHEN f.user1_id = auth.uid() THEN f.user2_id
                ELSE f.user1_id
            END
        FROM friends f
        WHERE (f.user1_id = auth.uid() OR f.user2_id = auth.uid()) AND f.status = 'accepted'
    ) INTO friends_list;

    -- Get friends who favorited the winery
    SELECT COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email)), '[]')
    INTO favorited_by_list
    FROM profiles p
    JOIN favorites f ON p.id = f.user_id
    WHERE f.winery_id = winery_id_param AND p.id = ANY(friends_list);

    -- Get friends who have the winery on their wishlist
    SELECT COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email)), '[]')
    INTO wishlisted_by_list
    FROM profiles p
    JOIN wishlist w ON p.id = w.user_id
    WHERE w.winery_id = winery_id_param AND p.id = ANY(friends_list);

    -- Return the result as JSON
    RETURN json_build_object(
        'favoritedBy', favorited_by_list,
        'wishlistedBy', wishlisted_by_list
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_friends_activity_for_winery(integer) TO authenticated;

CREATE OR REPLACE FUNCTION get_friends_ratings_for_winery(winery_id_param integer)
RETURNS TABLE(user_id uuid, name text, email text, rating integer, user_review text, photos text[])
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as user_id,
        p.name,
        p.email,
        v.rating,
        v.user_review,
        v.photos
    FROM
        visits v
    JOIN
        profiles p ON v.user_id = p.id
    WHERE
        v.winery_id = winery_id_param
        AND v.user_id IN (SELECT friend_id FROM get_friends_ids())
        AND (v.rating IS NOT NULL OR v.user_review IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION get_friends_ratings_for_winery(integer) TO authenticated;

CREATE OR REPLACE FUNCTION get_wineries_for_trip_planner(trip_date_param date)
RETURNS TABLE (
    id integer,
    google_place_id text,
    name character varying(255),
    address text,
    latitude numeric,
    longitude numeric,
    phone character varying(20),
    website character varying(255),
    google_rating numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean,
    trip_id integer,
    trip_name character varying(255),
    trip_date date,
    visit_order integer,
    notes text
) AS $$
BEGIN
    RETURN QUERY
    WITH user_trips AS (
        SELECT t.id, t.name, t.trip_date
        FROM trips t
        WHERE t.user_id = auth.uid() AND t.trip_date = trip_date_param
    ),
    wineries_in_trips AS (
        SELECT
            tw.winery_id,
            ut.id as trip_id,
            ut.name as trip_name,
            ut.trip_date,
            tw.visit_order,
            tw.notes
        FROM trip_wineries tw
        JOIN user_trips ut ON tw.trip_id = ut.id
    )
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone,
        w.website,
        w.google_rating,
        bool_or(f.user_id IS NOT NULL) as is_favorite,
        bool_or(wl.user_id IS NOT NULL) as on_wishlist,
        bool_or(v.user_id IS NOT NULL) as user_visited,
        wit.trip_id,
        wit.trip_name,
        wit.trip_date,
        wit.visit_order,
        wit.notes
    FROM wineries w
    JOIN wineries_in_trips wit ON w.id = wit.winery_id
    LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    LEFT JOIN visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
    GROUP BY w.id, wit.trip_id, wit.trip_name, wit.trip_date, wit.visit_order, wit.notes;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_wineries_for_trip_planner(date) TO authenticated;

CREATE OR REPLACE FUNCTION get_winery_details(winery_id_param integer)
RETURNS TABLE (
    id integer,
    google_place_id text,
    name character varying(255),
    address text,
    latitude numeric,
    longitude numeric,
    phone character varying(20),
    website character varying(255),
    google_rating numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean,
    visits jsonb
) AS $$
DECLARE
    v_visits jsonb;
BEGIN
    SELECT jsonb_agg(v_agg)
    INTO v_visits
    FROM (
        SELECT v.id, v.visit_date, v.user_review, v.rating, v.photos
        FROM visits v
        WHERE v.winery_id = winery_id_param AND v.user_id = auth.uid()
        ORDER BY v.visit_date DESC
    ) AS v_agg;

    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone,
        w.website,
        w.google_rating,
        f.user_id IS NOT NULL AS is_favorite,
        wl.user_id IS NOT NULL AS on_wishlist,
        v_visits IS NOT NULL AND jsonb_array_length(v_visits) > 0 AS user_visited,
        v_visits AS visits
    FROM wineries w
    LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    WHERE w.id = winery_id_param;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_winery_details(integer) TO authenticated;

CREATE OR REPLACE FUNCTION search_wineries_by_name_and_location(
    search_query text,
    user_lat double precision,
    user_lng double precision
)
RETURNS TABLE (
    id integer,
    google_place_id text,
    name character varying(255),
    address text,
    latitude numeric,
    longitude numeric,
    phone character varying(20),
    website character varying(255),
    google_rating numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean,
    distance_meters double precision
) AS $$
BEGIN
    RETURN QUERY
    WITH winery_matches AS (
        SELECT
            w.id,
            w.google_place_id,
            w.name,
            w.address,
            w.latitude,
            w.longitude,
            w.phone,
            w.website,
            w.google_rating,
            bool_or(f.user_id IS NOT NULL) as is_favorite,
            bool_or(wl.user_id IS NOT NULL) as on_wishlist,
            bool_or(v.user_id IS NOT NULL) as user_visited
        FROM wineries w
        LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
        LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
        LEFT JOIN visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
        WHERE w.name ILIKE '%' || search_query || '%'
        GROUP BY w.id
    )
    SELECT
        wm.*,
        ST_Distance(
            ST_MakePoint(wm.longitude::double precision, wm.latitude::double precision)::geography,
            ST_MakePoint(user_lng, user_lat)::geography
        ) as distance_meters
    FROM winery_matches wm
    ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION search_wineries_by_name_and_location(text, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION get_all_wineries_with_user_data()
RETURNS TABLE (
    id integer,
    google_place_id text,
    name character varying(255),
    address text,
    latitude numeric,
    longitude numeric,
    phone character varying(20),
    website character varying(255),
    google_rating numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone,
        w.website,
        w.google_rating,
        bool_or(f.user_id IS NOT NULL) as is_favorite,
        bool_or(wl.user_id IS NOT NULL) as on_wishlist,
        bool_or(v.user_id IS NOT NULL) as user_visited
    FROM wineries w
    LEFT JOIN favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    LEFT JOIN visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
    GROUP BY w.id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_all_wineries_with_user_data() TO authenticated;

CREATE OR REPLACE FUNCTION get_user_trips_with_wineries()
RETURNS TABLE (
    id integer,
    user_id uuid,
    trip_date date,
    name character varying(255),
    created_at timestamp with time zone,
    members uuid[],
    wineries jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        t.members,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', w.id,
                    'google_place_id', w.google_place_id,
                    'name', w.name,
                    'address', w.address,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'phone', w.phone,
                    'website', w.website,
                    'google_rating', w.google_rating,
                    'visit_order', tw.visit_order,
                    'notes', tw.notes,
                    'dbId', w.id
                ) ORDER BY tw.visit_order
            )
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = t.id
        ) as wineries
    FROM trips t
    WHERE t.user_id = auth.uid() OR auth.uid() = ANY(t.members)
    ORDER BY t.trip_date DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_user_trips_with_wineries() TO authenticated;

CREATE OR REPLACE FUNCTION get_paginated_visits_with_winery_and_friends(
    page_number int,
    page_size int
)
RETURNS TABLE (
    visit_id integer,
    visit_date date,
    user_review text,
    rating integer,
    photos text[],
    winery_id integer,
    winery_name character varying(255),
    winery_address text,
    friend_visits jsonb
) AS $$
BEGIN
    RETURN QUERY
    WITH user_and_friends_visits AS (
        SELECT
            v.id as visit_id,
            v.visit_date,
            v.user_review,
            v.rating,
            v.photos,
            v.winery_id,
            w.name as winery_name,
            w.address as winery_address,
            v.user_id
        FROM visits v
        JOIN wineries w ON v.winery_id = w.id
        WHERE v.user_id = auth.uid() OR v.user_id IN (SELECT friend_id FROM get_friends_ids())
    ),
    aggregated_friend_visits AS (
        SELECT
            fv.winery_id,
            fv.visit_date,
            jsonb_agg(jsonb_build_object(
                'user_id', fv.user_id,
                'name', p.name,
                'rating', fv.rating,
                'user_review', fv.user_review
            )) as friend_visits
        FROM user_and_friends_visits fv
        JOIN profiles p ON fv.user_id = p.id
        WHERE fv.user_id != auth.uid()
        GROUP BY fv.winery_id, fv.visit_date
    )
    SELECT
        uv.visit_id,
        uv.visit_date,
        uv.user_review,
        uv.rating,
        uv.photos,
        uv.winery_id,
        uv.winery_name,
        uv.winery_address,
        afv.friend_visits
    FROM user_and_friends_visits uv
    LEFT JOIN aggregated_friend_visits afv ON uv.winery_id = afv.winery_id AND uv.visit_date = afv.visit_date
    WHERE uv.user_id = auth.uid()
    ORDER BY uv.visit_date DESC, uv.visit_id DESC
    LIMIT page_size
    OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_paginated_visits_with_winery_and_friends(int, int) TO authenticated;
