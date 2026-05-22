-- Migration: 20260305140740_optimize_rls_performance.sql (v2)

-- 6. Missing Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_follow_requests_follower_id ON public.follow_requests(follower_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_following_id ON public.follow_requests(following_id);
