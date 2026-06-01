import { createClient } from "@supabase/supabase-js"
import { ENRICHMENT_FIELD_MASK } from "../_shared/google-maps.ts"
import { shouldEnrich } from "../_shared/enrichment.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { placeId } = await req.json()
    if (!placeId) throw new Error('placeId is required')

    // 1. Check Cache
    const { data: winery, error: selectError } = await supabaseClient
      .from('wineries')
      .select('*')
      .eq('google_place_id', placeId)
      .single()

    if (selectError && selectError.code !== 'PGRST116') throw selectError

    const needsEnrichment = shouldEnrich(winery)

    if (!needsEnrichment && winery) {
      return new Response(
        JSON.stringify({ 
          ...winery, 
          id: winery.google_place_id, 
          dbId: Number(winery.id) 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Fetch from Google V1
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!apiKey) {
      throw new Error('Missing GOOGLE_MAPS_API_KEY')
    }

    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': ENRICHMENT_FIELD_MASK.replace(/places\./g, ''), // GET /places/{id} doesn't use 'places.' prefix in mask
      },
    })

    const place = await response.json()
    if (place.error) throw new Error(place.error.message)

    // 3. Normalize & Upsert
    const wineryData = {
      google_place_id: place.id,
      name: place.displayName?.text,
      address: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      phone: place.internationalPhoneNumber || null,
      website: place.websiteUri || null,
      google_rating: place.rating || null,
      opening_hours: place.regularOpeningHours || null,
      reviews: place.reviews || null,
      enrichment_tier: 'enriched',
      last_enriched_at: new Date().toISOString(),
      generative_summary: place.generativeSummary ? { overview: { text: place.generativeSummary.overview?.text } } : null,
      neighborhood_summary: place.neighborhoodSummary ? { overview: { text: place.neighborhoodSummary.overview?.text } } : null,
      editorial_summary: place.editorialSummary ? { overview: { text: place.editorialSummary.overview?.text } } : null,
      allows_dogs: place.allowsDogs ?? null,
      has_ev_charging: place.parkingOptions?.hasEvChargingStations ?? null,
      serves_wine: place.servesWine ?? null,
      good_for_children: place.goodForChildren ?? null,
      outdoor_seating: place.outdoorSeating ?? null,
      parking_options: place.parkingOptions || null,
      accessibility_flags: place.accessibilityOptions || null,
    }

    const { data: upsertedWinery, error: upsertError } = await supabaseClient
      .from('wineries')
      .upsert(wineryData, { onConflict: 'google_place_id' })
      .select()
      .single()

    if (upsertError) throw upsertError

    return new Response(
      JSON.stringify({ 
        ...upsertedWinery, 
        id: upsertedWinery.google_place_id, 
        dbId: Number(upsertedWinery.id) 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    const error = err as Error;
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

Deno.serve(handler)
