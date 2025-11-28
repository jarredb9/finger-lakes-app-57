

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_all_wineries_with_user_data"() RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_all_wineries_with_user_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_activity_for_winery"("winery_id_param" integer) RETURNS json
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."get_friends_activity_for_winery"("winery_id_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_ids"() RETURNS TABLE("friend_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_friends_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_ratings_for_winery"("winery_id_param" integer) RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "rating" integer, "user_review" "text", "photos" "text"[])
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."get_friends_ratings_for_winery"("winery_id_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_wineries_for_trip_planner"("trip_date_param" "date") RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "trip_id" integer, "trip_name" character varying, "trip_date" "date", "visit_order" integer, "notes" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_wineries_for_trip_planner"("trip_date_param" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_winery_details"("winery_id_param" integer) RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "visits" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_winery_details"("winery_id_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email)
    VALUES (new.id, new.raw_user_meta_data->>'name', new.email);
    RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_member"("trip_id_to_check" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.trips
        WHERE id = trip_id_to_check
          AND (auth.uid() = user_id OR auth.uid() = ANY(members))
    );
END;
$$;


ALTER FUNCTION "public"."is_trip_member"("trip_id_to_check" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_wineries_by_name_and_location"("search_query" "text", "user_lat" double precision, "user_lng" double precision) RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "distance_meters" double precision)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."search_wineries_by_name_and_location"("search_query" "text", "user_lat" double precision, "user_lng" double precision) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "winery_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."favorites_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."favorites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."favorites_id_seq" OWNED BY "public"."favorites"."id";



CREATE TABLE IF NOT EXISTS "public"."friends" (
    "id" integer NOT NULL,
    "user1_id" "uuid" NOT NULL,
    "user2_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friends_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."friends" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."friends_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."friends_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."friends_id_seq" OWNED BY "public"."friends"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_wineries" (
    "id" integer NOT NULL,
    "trip_id" integer NOT NULL,
    "winery_id" integer NOT NULL,
    "visit_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."trip_wineries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."trip_wineries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."trip_wineries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."trip_wineries_id_seq" OWNED BY "public"."trip_wineries"."id";



CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trip_date" "date" NOT NULL,
    "name" character varying(255),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "members" "uuid"[]
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."trips_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."trips_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."trips_id_seq" OWNED BY "public"."trips"."id";



CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "winery_id" integer NOT NULL,
    "visit_date" "date" NOT NULL,
    "user_review" "text",
    "rating" integer,
    "photos" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "visits_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."visits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."visits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."visits_id_seq" OWNED BY "public"."visits"."id";



CREATE TABLE IF NOT EXISTS "public"."wineries" (
    "id" integer NOT NULL,
    "google_place_id" "text",
    "name" character varying(255) NOT NULL,
    "address" "text" NOT NULL,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "phone" character varying(20),
    "website" character varying(255),
    "google_rating" numeric(2,1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "opening_hours" "jsonb",
    "reviews" "jsonb",
    "reservable" boolean
);


ALTER TABLE "public"."wineries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."wineries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wineries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wineries_id_seq" OWNED BY "public"."wineries"."id";



CREATE TABLE IF NOT EXISTS "public"."wishlist" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "winery_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wishlist" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."wishlist_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wishlist_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wishlist_id_seq" OWNED BY "public"."wishlist"."id";



ALTER TABLE ONLY "public"."favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."favorites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."friends" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."friends_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."trip_wineries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."trip_wineries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."trips" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."trips_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."visits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."visits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wineries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wineries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wishlist" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wishlist_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_winery_id_key" UNIQUE ("user_id", "winery_id");



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user1_id_user2_id_key" UNIQUE ("user1_id", "user2_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_trip_id_winery_id_key" UNIQUE ("trip_id", "winery_id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wineries"
    ADD CONSTRAINT "wineries_google_place_id_key" UNIQUE ("google_place_id");



ALTER TABLE ONLY "public"."wineries"
    ADD CONSTRAINT "wineries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_user_id_winery_id_key" UNIQUE ("user_id", "winery_id");



CREATE INDEX "idx_favorites_user_id" ON "public"."favorites" USING "btree" ("user_id");



CREATE INDEX "idx_trip_wineries_trip_id" ON "public"."trip_wineries" USING "btree" ("trip_id");



CREATE INDEX "idx_trips_user_id_trip_date" ON "public"."trips" USING "btree" ("user_id", "trip_date");



CREATE INDEX "idx_visits_user_id" ON "public"."visits" USING "btree" ("user_id");



CREATE INDEX "idx_wineries_google_place_id" ON "public"."wineries" USING "btree" ("google_place_id");



CREATE INDEX "idx_wishlist_user_id" ON "public"."wishlist" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to insert wineries" ON "public"."wineries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Anyone can view wineries" ON "public"."wineries" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert wineries" ON "public"."wineries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can update wineries" ON "public"."wineries" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Trip members can add wineries to a trip" ON "public"."trip_wineries" FOR INSERT WITH CHECK ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Trip members can remove wineries from a trip" ON "public"."trip_wineries" FOR DELETE USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Trip members can update wineries on a trip" ON "public"."trip_wineries" FOR UPDATE USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Trip members can view trip wineries" ON "public"."trip_wineries" FOR SELECT USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Users can create friend requests" ON "public"."friends" FOR INSERT WITH CHECK (("auth"."uid"() = "user1_id"));



CREATE POLICY "Users can delete their own favorite items" ON "public"."favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own friendships" ON "public"."friends" FOR DELETE USING ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Users can delete their own trips" ON "public"."trips" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own visits" ON "public"."visits" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own wishlist items" ON "public"."wishlist" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own favorite items" ON "public"."favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own trips" ON "public"."trips" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own visits" ON "public"."visits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own wishlist items" ON "public"."wishlist" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can respond to friend requests" ON "public"."friends" FOR UPDATE USING (("auth"."uid"() = "user2_id")) WITH CHECK (("status" = ANY (ARRAY['accepted'::"text", 'declined'::"text"])));



CREATE POLICY "Users can update their own profile." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own trips" ON "public"."trips" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = ANY ("members"))));



CREATE POLICY "Users can update their own visits" ON "public"."visits" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own and friends' favorites" ON "public"."favorites" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("user_id" IN ( SELECT "get_friends_ids"."friend_id"
   FROM "public"."get_friends_ids"() "get_friends_ids"("friend_id")))));



CREATE POLICY "Users can view their own and friends' wishlist items" ON "public"."wishlist" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("user_id" IN ( SELECT "get_friends_ids"."friend_id"
   FROM "public"."get_friends_ids"() "get_friends_ids"("friend_id")))));



CREATE POLICY "Users can view their own and their friends' visits" ON "public"."visits" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("user_id" IN ( SELECT "get_friends_ids"."friend_id"
   FROM "public"."get_friends_ids"() "get_friends_ids"("friend_id")))));



CREATE POLICY "Users can view their own friendships" ON "public"."friends" FOR SELECT USING ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Users can view their own trips" ON "public"."trips" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = ANY ("members"))));



ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_wineries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wineries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."get_all_wineries_with_user_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_wineries_with_user_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_wineries_with_user_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friends_activity_for_winery"("winery_id_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_friends_activity_for_winery"("winery_id_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_activity_for_winery"("winery_id_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friends_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_friends_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friends_ratings_for_winery"("winery_id_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_friends_ratings_for_winery"("winery_id_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_ratings_for_winery"("winery_id_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_wineries_for_trip_planner"("trip_date_param" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_wineries_for_trip_planner"("trip_date_param" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_wineries_for_trip_planner"("trip_date_param" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_winery_details"("winery_id_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_winery_details"("winery_id_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_winery_details"("winery_id_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_member"("trip_id_to_check" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_member"("trip_id_to_check" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_member"("trip_id_to_check" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_wineries_by_name_and_location"("search_query" "text", "user_lat" double precision, "user_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."search_wineries_by_name_and_location"("search_query" "text", "user_lat" double precision, "user_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_wineries_by_name_and_location"("search_query" "text", "user_lat" double precision, "user_lng" double precision) TO "service_role";


















GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."friends" TO "anon";
GRANT ALL ON TABLE "public"."friends" TO "authenticated";
GRANT ALL ON TABLE "public"."friends" TO "service_role";



GRANT ALL ON SEQUENCE "public"."friends_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."friends_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."friends_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."trip_wineries" TO "anon";
GRANT ALL ON TABLE "public"."trip_wineries" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_wineries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."trip_wineries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."trip_wineries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trip_wineries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON SEQUENCE "public"."trips_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."trips_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trips_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."visits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."visits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."visits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wineries" TO "anon";
GRANT ALL ON TABLE "public"."wineries" TO "authenticated";
GRANT ALL ON TABLE "public"."wineries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wineries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wineries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wineries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist" TO "anon";
GRANT ALL ON TABLE "public"."wishlist" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "User can delete their own photos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'visit-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "User can upload a photo to a visit"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'visit-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can view their own and friends photos"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'visit-photos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR ((storage.foldername(name))[1] IN ( SELECT (get_friends_ids.friend_id)::text AS friend_id
   FROM public.get_friends_ids() get_friends_ids(friend_id))))));



