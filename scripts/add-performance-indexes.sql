-- This script adds indexes to frequently queried columns to improve performance.

-- Index for fetching visits by user
CREATE INDEX IF NOT EXISTS idx_visits_user_id ON public.visits(user_id);

-- Index for fetching trips by user and date
CREATE INDEX IF NOT EXISTS idx_trips_user_id_trip_date ON public.trips(user_id, trip_date);

-- Index for fetching trip wineries by trip ID
CREATE INDEX IF NOT EXISTS idx_trip_wineries_trip_id ON public.trip_wineries(trip_id);

-- Index for fetching wishlist items by user
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON public.wishlist(user_id);

-- Index for fetching favorite items by user
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);

-- Index for looking up wineries by their Google Place ID
CREATE INDEX IF NOT EXISTS idx_wineries_google_place_id ON public.wineries(google_place_id);

-- Verify that the indexes have been created
SELECT
    tablename,
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    schemaname = 'public'
ORDER BY
    tablename,
    indexname;