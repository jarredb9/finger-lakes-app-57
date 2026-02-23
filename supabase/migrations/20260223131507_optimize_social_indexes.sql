-- Optimize social queries with composite indexes
-- Based on supabase-postgres-best-practices (query-composite-indexes.md)

-- Improve performance of get_friend_activity_feed which filters by user_id and orders by created_at
CREATE INDEX IF NOT EXISTS idx_visits_user_id_created_at ON public.visits (user_id, created_at DESC);

-- Improve performance of get_friends_ids which filters by user1_id/user2_id and status
CREATE INDEX IF NOT EXISTS idx_friends_user1_status ON public.friends (user1_id, status) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friends_user2_status ON public.friends (user2_id, status) WHERE status = 'accepted';
