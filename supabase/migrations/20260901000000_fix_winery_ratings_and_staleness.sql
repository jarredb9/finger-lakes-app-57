-- Migration: Fix Winery Ratings and Refresh Corrupted Records
-- Date: 2026-09-01
-- Description: 
-- 1. Updates bulk_upsert_wineries and ensure_winery to never overwrite positive ratings with 0 or NULL, and to normalize 0 ratings to NULL on insert.
-- 2. Resets existing wineries with google_rating <= 0 so they are flagged for immediate re-enrichment.

CREATE OR REPLACE FUNCTION public.bulk_upsert_wineries(p_wineries_data jsonb[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  winery_record jsonb;
BEGIN
  FOREACH winery_record IN ARRAY p_wineries_data LOOP
    INSERT INTO public.wineries (
      google_place_id,
      name,
      address,
      latitude,
      longitude,
      phone,
      website,
      google_rating,
      user_rating_count,
      opening_hours,
      reviews,
      reservable,
      enrichment_tier,
      last_enriched_at,
      generative_summary,
      neighborhood_summary,
      editorial_summary,
      primary_photo_reference,
      photo_references,
      allows_dogs,
      good_for_children,
      outdoor_seating,
      has_ev_charging,
      serves_wine,
      parking_options,
      accessibility_flags,
      varietals,
      vibe_tags,
      last_action_timestamp,
      revision_id
    ) VALUES (
      winery_record->>'google_place_id',
      winery_record->>'name',
      winery_record->>'address',
      (winery_record->>'latitude')::double precision,
      (winery_record->>'longitude')::double precision,
      winery_record->>'phone',
      winery_record->>'website',
      (CASE WHEN (winery_record->>'google_rating')::double precision > 0 THEN (winery_record->>'google_rating')::double precision ELSE NULL END),
      (CASE WHEN (winery_record->>'user_rating_count')::integer > 0 THEN (winery_record->>'user_rating_count')::integer ELSE NULL END),
      (winery_record->'opening_hours'),
      (winery_record->'reviews'),
      (winery_record->>'reservable')::boolean,
      COALESCE(winery_record->>'enrichment_tier', 'basic'),
      (winery_record->>'last_enriched_at')::timestamptz,
      (winery_record->'generative_summary'),
      (winery_record->'neighborhood_summary'),
      (winery_record->'editorial_summary'),
      winery_record->>'primary_photo_reference',
      (winery_record->'photo_references'),
      (winery_record->>'allows_dogs')::boolean,
      (winery_record->>'good_for_children')::boolean,
      (winery_record->>'outdoor_seating')::boolean,
      (winery_record->>'has_ev_charging')::boolean,
      (winery_record->>'serves_wine')::boolean,
      (winery_record->'parking_options'),
      (winery_record->'accessibility_flags'),
      (winery_record->'varietals'),
      (CASE 
        WHEN jsonb_typeof(winery_record->'vibe_tags') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(winery_record->'vibe_tags'))
        ELSE '{}'::text[] 
      END),
      now(),
      gen_random_uuid()
    ) ON CONFLICT (google_place_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, wineries.name),
      address = COALESCE(EXCLUDED.address, wineries.address),
      latitude = COALESCE(EXCLUDED.latitude, wineries.latitude),
      longitude = COALESCE(EXCLUDED.longitude, wineries.longitude),
      phone = COALESCE(EXCLUDED.phone, wineries.phone),
      website = COALESCE(EXCLUDED.website, wineries.website),
      google_rating = CASE 
        WHEN EXCLUDED.google_rating IS NOT NULL AND EXCLUDED.google_rating > 0 THEN EXCLUDED.google_rating
        WHEN wineries.google_rating IS NOT NULL AND wineries.google_rating > 0 THEN wineries.google_rating
        ELSE NULL
      END,
      user_rating_count = CASE 
        WHEN EXCLUDED.user_rating_count IS NOT NULL AND EXCLUDED.user_rating_count > 0 THEN EXCLUDED.user_rating_count
        WHEN wineries.user_rating_count IS NOT NULL AND wineries.user_rating_count > 0 THEN wineries.user_rating_count
        ELSE NULL
      END,
      opening_hours = COALESCE(EXCLUDED.opening_hours, wineries.opening_hours),
      reviews = COALESCE(EXCLUDED.reviews, wineries.reviews),
      reservable = COALESCE(EXCLUDED.reservable, wineries.reservable),
      enrichment_tier = CASE 
        WHEN wineries.enrichment_tier = 'enriched' THEN 'enriched'
        ELSE COALESCE(EXCLUDED.enrichment_tier, wineries.enrichment_tier)
      END,
      last_enriched_at = CASE 
        WHEN EXCLUDED.enrichment_tier = 'enriched' THEN EXCLUDED.last_enriched_at
        ELSE wineries.last_enriched_at
      END,
      generative_summary = COALESCE(EXCLUDED.generative_summary, wineries.generative_summary),
      neighborhood_summary = COALESCE(EXCLUDED.neighborhood_summary, wineries.neighborhood_summary),
      editorial_summary = COALESCE(EXCLUDED.editorial_summary, wineries.editorial_summary),
      primary_photo_reference = COALESCE(EXCLUDED.primary_photo_reference, wineries.primary_photo_reference),
      photo_references = COALESCE(EXCLUDED.photo_references, wineries.photo_references),
      allows_dogs = COALESCE(EXCLUDED.allows_dogs, wineries.allows_dogs),
      good_for_children = COALESCE(EXCLUDED.good_for_children, wineries.good_for_children),
      outdoor_seating = COALESCE(EXCLUDED.outdoor_seating, wineries.outdoor_seating),
      has_ev_charging = COALESCE(EXCLUDED.has_ev_charging, wineries.has_ev_charging),
      serves_wine = COALESCE(EXCLUDED.serves_wine, wineries.serves_wine),
      parking_options = COALESCE(EXCLUDED.parking_options, wineries.parking_options),
      accessibility_flags = COALESCE(EXCLUDED.accessibility_flags, wineries.accessibility_flags),
      varietals = CASE 
        WHEN EXCLUDED.varietals IS NOT NULL AND jsonb_typeof(EXCLUDED.varietals) = 'array' AND jsonb_array_length(EXCLUDED.varietals) > 0
        THEN EXCLUDED.varietals
        ELSE wineries.varietals
      END,
      vibe_tags = CASE 
        WHEN EXCLUDED.vibe_tags IS NOT NULL AND cardinality(EXCLUDED.vibe_tags) > 0 
        THEN EXCLUDED.vibe_tags 
        ELSE wineries.vibe_tags 
      END,
      last_action_timestamp = EXCLUDED.last_action_timestamp,
      revision_id = EXCLUDED.revision_id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_winery(p_winery_data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_winery_id integer;
BEGIN
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (CASE WHEN (p_winery_data->>'rating')::numeric > 0 THEN (p_winery_data->>'rating')::numeric ELSE NULL END)
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name,
    google_rating = CASE 
      WHEN EXCLUDED.google_rating IS NOT NULL AND EXCLUDED.google_rating > 0 THEN EXCLUDED.google_rating
      WHEN wineries.google_rating IS NOT NULL AND wineries.google_rating > 0 THEN wineries.google_rating
      ELSE NULL
    END
  RETURNING id INTO v_winery_id;

  RETURN v_winery_id;
END;
$$;

-- Reset existing wineries with google_rating <= 0 so they are flagged for immediate re-enrichment
UPDATE public.wineries
SET 
  google_rating = NULL,
  user_rating_count = NULL,
  last_enriched_at = NULL
WHERE google_rating IS NOT NULL AND google_rating <= 0;

