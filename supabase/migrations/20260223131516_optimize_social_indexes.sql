CREATE INDEX IF NOT EXISTS idx_visits_user_id_created_at ON public.visits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user1_status ON public.friends (user1_id, status) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friends_user2_status ON public.friends (user2_id, status) WHERE status = 'accepted';