import { createClient } from "@supabase/supabase-js"
import { ESSENTIALS_FIELD_MASK, ENRICHMENT_FIELD_MASK } from "../_shared/google-maps.ts"
import { normalizeGooglePlaceV1 } from "../_shared/normalization.ts"

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

    // Normalize results using shared utility
    const dbWineries = googlePlaces.map((place: any) => 
      normalizeGooglePlaceV1(place, useEnrichment ? 'enriched' : 'basic')
    );

    // Background persistence
    if (dbWineries.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Use bulk upsert RPC (Hybrid Pattern)
      const { error: upsertError } = await supabase.rpc('bulk_upsert_wineries', {
        p_wineries_data: dbWineries
      });

      if (upsertError) {
        console.error('Background persistence failed:', upsertError);
      }
    }

    // Map to client format (preserving legacy field names for frontend compatibility)
    const clientWineries = dbWineries.map((w: any) => ({
      ...w,
      id: w.google_place_id,
      rating: w.google_rating,
      generative_summary: w.generative_summary?.overview?.text || null,
      neighborhood_summary: w.neighborhood_summary?.overview?.text || null,
    }));

    return new Response(JSON.stringify(clientWineries), {
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
