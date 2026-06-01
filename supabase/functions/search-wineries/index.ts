import { serve } from \"https://deno.land/std@0.168.0/http/server.ts\"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Field Masks (Duplicated for Edge Function isolation or could be passed from client)
const ESSENTIALS_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.viewport',
  'places.types',
  'places.formattedAddress',
  'places.photos',
].join(',');

const ENRICHMENT_FIELD_MASK = [
  ...ESSENTIALS_FIELD_MASK.split(','),
  'places.generativeSummary',
  'places.neighborhoodSummary',
  'places.editorialSummary',
  'places.servesWine',
  'places.allowsDogs',
  'places.goodForChildren',
  'places.outdoorSeating',
  'places.reviews',
  'places.parkingOptions',
  'places.accessibilityOptions',
].join(',');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, locationRestriction, locationBias, useEnrichment = false } = await req.json()
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    
    if (!apiKey) {
      throw new Error('Missing GOOGLE_MAPS_API_KEY')
    }

    const fieldMask = useEnrichment ? ENRICHMENT_FIELD_MASK : ESSENTIALS_FIELD_MASK

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        textQuery: query,
        locationRestriction,
        locationBias,
        languageCode: 'en',
      }),
    })

    const data = await response.json()
    const googlePlaces = data.places || []

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
    }))

    // Background persistence
    if (normalizedWineries.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Prepare DB objects (snake_case)
      const dbWineries = normalizedWineries.map((w: any) => ({
        google_place_id: w.id,
        name: w.name,
        address: w.address,
        latitude: w.latitude,
        longitude: w.longitude,
        website: w.website,
        rating: w.rating,
        enrichment_tier: w.enrichment_tier,
        last_enriched_at: w.last_enriched_at,
        generative_summary: w.generative_summary ? { overview: { text: w.generative_summary } } : null,
        neighborhood_summary: w.neighborhood_summary ? { overview: { text: w.neighborhood_summary } } : null,
        allows_dogs: w.allows_dogs,
        has_ev_charging: w.has_ev_charging,
        serves_wine: w.serves_wine,
        good_for_children: w.good_for_children,
        outdoor_seating: w.outdoor_seating,
      }))

      // Use EdgeRuntime.waitUntil for non-blocking upsert
      (EdgeRuntime as any).waitUntil(
        supabase.rpc('bulk_upsert_wineries', { wineries_data: dbWineries })
          .then(({ error }: any) => {
            if (error) console.error('Error persisting wineries:', error)
          })
      )
    }

    return new Response(
      JSON.stringify(normalizedWineries),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
