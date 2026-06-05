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
      google_rating,
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
      reviews,
      last_action_timestamp,
      revision_id
    ) VALUES (
      winery_record->>'google_place_id',
      winery_record->>'name',
      winery_record->>'address',
      (winery_record->>'latitude')::double precision,
      (winery_record->>'longitude')::double precision,
      (winery_record->>'google_rating')::double precision,
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
      (winery_record->'reviews'),
      now(),
      gen_random_uuid()
    ) ON CONFLICT (google_place_id) DO UPDATE SET
      google_rating = COALESCE(EXCLUDED.google_rating, wineries.google_rating),
      name = COALESCE(EXCLUDED.name, wineries.name),
      address = COALESCE(EXCLUDED.address, wineries.address),
      latitude = COALESCE(EXCLUDED.latitude, wineries.latitude),
      longitude = COALESCE(EXCLUDED.longitude, wineries.longitude),
      enrichment_tier = COALESCE(EXCLUDED.enrichment_tier, wineries.enrichment_tier),
      last_enriched_at = COALESCE(EXCLUDED.last_enriched_at, wineries.last_enriched_at),
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
      reviews = COALESCE(EXCLUDED.reviews, wineries.reviews),
      last_action_timestamp = EXCLUDED.last_action_timestamp,
      revision_id = EXCLUDED.revision_id;
  END LOOP;
END;
$function$;
