CREATE TABLE public.favorites (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, winery_id integer NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.friends (id SERIAL PRIMARY KEY, user1_id uuid NOT NULL, user2_id uuid NOT NULL, status text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.profiles (id uuid NOT NULL, name text, email text, PRIMARY KEY (id));
CREATE TABLE public.trip_wineries (id SERIAL PRIMARY KEY, trip_id integer NOT NULL, winery_id integer NOT NULL, visit_order integer NOT NULL, created_at timestamp with time zone DEFAULT now(), notes text);
CREATE TABLE public.trips (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, trip_date date NOT NULL, name character varying(255), created_at timestamp with time zone DEFAULT now(), members uuid[]);
CREATE TABLE public.visits (id SERIAL PRIMARY KEY, user_id uuid NOT NULL, winery_id integer NOT NULL, visit_date date NOT NULL, user_review text, rating integer, photos text[], created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.wineries (id SERIAL PRIMARY KEY, google_place_id text, name character varying(255) NOT NULL, address text NOT NULL, latitude numeric, longitude numeric, phone character varying(20), website character varying(255), google_rating numeric, created_at timestamp with time zone DEFAULT now());
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

-- wishlist
CREATE POLICY "Users can delete their own wishlist items" ON public.wishlist FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own wishlist items" ON public.wishlist FOR INSERT WITH CHECK (auth.uid() = user_id);
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