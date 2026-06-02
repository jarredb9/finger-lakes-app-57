import { createClient } from "@supabase/supabase-js"
import { ESSENTIALS_FIELD_MASK, ENRICHMENT_FIELD_MASK } from "../_shared/google-maps.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, locationRestriction, locationBias, useEnrichment = false } = await req.json();
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!apiKey) {
      throw new Error('Missing GOOGLE_MAPS_API_KEY');
    }

    const fieldMask = useEnrichment ? ENRICHMENT_FIELD_MASK : ESSENTIALS_FIELD_MASK;

    // Google Places V1 expects a specific rectangle format for locationRestriction
    let googleLocationRestriction = locationRestriction;
    if (locationRestriction && locationRestriction.north && locationRestriction.south) {
      googleLocationRestriction = {
        rectangle: {
          low: {
            latitude: locationRestriction.south,
            longitude: locationRestriction.west,
          },
          high: {
            latitude: locationRestriction.north,
            longitude: locationRestriction.east,
          },
        },
      };
    }

    console.log(`[SearchWineries] Query: "${query}", UseEnrichment: ${useEnrichment}`);
    
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        textQuery: query,
        locationRestriction: googleLocationRestriction,
        locationBias,
        languageCode: 'en',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SearchWineries] Google API Error (${response.status}):`, errorText);
      throw new Error(`Google API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const googlePlaces = data.places || [];
    console.log(`[SearchWineries] Google returned ${googlePlaces.length} places.`);

    if (googlePlaces.length === 0) {
        console.log('[SearchWineries] Raw Google Response:', JSON.stringify(data));
    }

    // Normalize results for client
    const normalizedWineries = googlePlaces.map((place: any) => ({
      id: place.id,
      name: place.displayName?.text,
      address: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      website: place.websiteUri || null,
      rating: place.rating || null,
      enrichment_tier: useEnrichment ? 'enriched' : 'basic',
      last_enriched_at: useEnrichment ? new Date().toISOString() : null,
      // Enriched fields
      generative_summary: place.generativeSummary?.overview?.text || null,
      neighborhood_summary: place.neighborhoodSummary?.overview?.text || null,
      allows_dogs: place.allowsDogs ?? null,
      has_ev_charging: place.parkingOptions?.hasEvChargingStations ?? null,
      serves_wine: place.servesWine ?? null,
      good_for_children: place.goodForChildren ?? null,
      outdoor_seating: place.outdoorSeating ?? null,
      routing_summaries: place.routingSummaries || null,
      primary_photo_reference: place.photos && place.photos.length > 0 ? place.photos[0].name : null,
      photo_references: place.photos && place.photos.length > 0 ? place.photos.map((p: any) => p.name) : null,
    }));

    // Background persistence
    if (normalizedWineries.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Prepare DB objects (snake_case)
      const dbWineries = normalizedWineries.map((w: any) => ({
        google_place_id: w.id,
        name: w.name,
        address: w.address,
        latitude: w.latitude,
        longitude: w.longitude,
        website: w.website,
        google_rating: w.rating,
        enrichment_tier: w.enrichment_tier,
        last_enriched_at: w.last_enriched_at,
        generative_summary: w.generative_summary ? { overview: { text: w.generative_summary } } : null,
        neighborhood_summary: w.neighborhood_summary ? { overview: { text: w.neighborhood_summary } } : null,
        allows_dogs: w.allows_dogs,
        has_ev_charging: w.has_ev_charging,
        serves_wine: w.serves_wine,
        good_for_children: w.good_for_children,
        outdoor_seating: w.outdoor_seating,
        primary_photo_reference: w.primary_photo_reference,
        photo_references: w.photo_references,
      }));

      // Use bulk upsert RPC
      const { error: upsertError } = await supabase.rpc('bulk_upsert_wineries', {
        p_wineries_data: dbWineries
      });

      if (upsertError) {
        console.error('Background persistence failed:', upsertError);
      }
    }

    return new Response(JSON.stringify(normalizedWineries), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const error = err as Error;
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

Deno.serve(handler);
