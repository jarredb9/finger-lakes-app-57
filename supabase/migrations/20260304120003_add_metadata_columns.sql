-- Add metadata JSONB columns to visits, favorites, and wishlist
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add GIN indexes for efficient JSONB searching
CREATE INDEX IF NOT EXISTS idx_visits_metadata ON public.visits USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_favorites_metadata ON public.favorites USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_wishlist_metadata ON public.wishlist USING GIN (metadata);
