-- Add missing indexes on foreign keys to improve query performance.

CREATE INDEX IF NOT EXISTS idx_visits_winery_id ON public.visits(winery_id);
CREATE INDEX IF NOT EXISTS idx_favorites_winery_id ON public.favorites(winery_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_winery_id ON public.wishlist(winery_id);
CREATE INDEX IF NOT EXISTS idx_trip_wineries_winery_id ON public.trip_wineries(winery_id);
CREATE INDEX IF NOT EXISTS idx_friends_user1_id ON public.friends(user1_id);
CREATE INDEX IF NOT EXISTS idx_friends_user2_id ON public.friends(user2_id);
