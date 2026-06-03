-- Migration: Enriched Winery Attributes & Sync-Lock
-- Track: Places API (New) Migration & Enhancement

-- 1. Add Enrichment Attributes
ALTER TABLE public.wineries
ADD COLUMN IF NOT EXISTS enrichment_tier text DEFAULT 'basic',
ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz,
ADD COLUMN IF NOT EXISTS generative_summary jsonb,
ADD COLUMN IF NOT EXISTS neighborhood_summary jsonb,
ADD COLUMN IF NOT EXISTS editorial_summary jsonb,
ADD COLUMN IF NOT EXISTS primary_photo_reference text,
ADD COLUMN IF NOT EXISTS photo_references jsonb,
ADD COLUMN IF NOT EXISTS allows_dogs boolean,
ADD COLUMN IF NOT EXISTS good_for_children boolean,
ADD COLUMN IF NOT EXISTS outdoor_seating boolean,
ADD COLUMN IF NOT EXISTS has_ev_charging boolean,
ADD COLUMN IF NOT EXISTS serves_wine boolean,
ADD COLUMN IF NOT EXISTS parking_options jsonb,
ADD COLUMN IF NOT EXISTS accessibility_flags jsonb;

-- 2. Add Sync-Lock Fields
ALTER TABLE public.wineries
ADD COLUMN IF NOT EXISTS last_action_timestamp timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS revision_id uuid DEFAULT gen_random_uuid();

-- 3. Security: Row Level Security Policies
-- Enable Update for Authenticated Users (matches current Insert policy)
DROP POLICY IF EXISTS "Authenticated users can update wineries" ON public.wineries;
CREATE POLICY "Authenticated users can update wineries" ON public.wineries
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (name IS NOT NULL AND google_place_id IS NOT NULL);

-- 4. Optimization Indices
CREATE INDEX IF NOT EXISTS idx_wineries_enrichment_tier ON public.wineries (enrichment_tier);
CREATE INDEX IF NOT EXISTS idx_wineries_allows_dogs ON public.wineries (allows_dogs) WHERE allows_dogs IS TRUE;
CREATE INDEX IF NOT EXISTS idx_wineries_has_ev_charging ON public.wineries (has_ev_charging) WHERE has_ev_charging IS TRUE;
