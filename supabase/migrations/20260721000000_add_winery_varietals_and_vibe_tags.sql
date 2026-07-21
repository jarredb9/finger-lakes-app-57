-- Migration: Add varietals and vibe_tags to public.wineries
-- Date: 2026-07-21
-- Description: Expand public.wineries with jsonb varietals and text[] vibe_tags using backwards-compatible expand-and-contract pattern.

ALTER TABLE public.wineries
ADD COLUMN IF NOT EXISTS varietals jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS vibe_tags text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.wineries.varietals IS 'Wine varietals offered with flavor profile data (dryness, body, tasting notes)';
COMMENT ON COLUMN public.wineries.vibe_tags IS 'At-a-glance atmosphere and amenity tags (e.g. Riesling Specialist, Dog Friendly, EV Charging)';
