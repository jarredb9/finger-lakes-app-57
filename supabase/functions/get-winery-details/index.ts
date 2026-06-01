import { serve } from \"https://deno.land/std@0.168.0/http/server.ts\"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STALE_THRESHOLD_DAYS = 30;

function isStale(lastEnrichedAt?: string | null): boolean {
  if (!lastEnrichedAt) return true;
  const lastDate = new Date(lastEnrichedAt);
  if (isNaN(lastDate.getTime())) return true;
  const diffTime = Math.abs(new Date().getTime() - lastDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > STALE_THRESHOLD_DAYS;
}

const ENRICHMENT_FIELD_MASK = [
  'id',
  'displayName',
  'location',
  'viewport',
  'types',
  'formattedAddress',
  'photos',
  'generativeSummary',
  'neighborhoodSummary',
  'editorialSummary',
  'servesWine',
  'allowsDogs',
  'goodForChildren',
  'outdoor_seating',
  'reviews',
  'parkingOptions',
  'accessibilityOptions',
  'rating',
  'websiteUri',
  'regularOpeningHours',
  'internationalPhoneNumber'
].join(',');

serve(async (req) => {
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

    const shouldEnrich = !winery || winery.enrichment_tier !== 'enriched' || isStale(winery.last_enriched_at)

    if (!shouldEnrich && winery) {
      return new Response(
        JSON.stringify({ ...winery, id: Number(winery.id) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Fetch from Google V1
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': ENRICHMENT_FIELD_MASK,
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
      rating: place.rating || null,
      opening_hours: place.regularOpeningHours || null,
      reviews: place.reviews || null,
      enrichment_tier: 'enriched',
      last_enriched_at: new Date().toISOString(),
      generative_summary: place.generativeSummary ? { overview: { text: place.generativeSummary.overview?.text } } : null,
      neighborhood_summary: place.neighborhoodSummary ? { overview: { text: place.neighborhoodSummary.overview?.text } } : null,
      allows_dogs: place.allowsDogs ?? null,
      has_ev_charging: place.parkingOptions?.hasEvChargingStations ?? null,
      serves_wine: place.servesWine ?? null,
      good_for_children: place.goodForChildren ?? null,
      outdoor_seating: place.outdoorSeating ?? null,
    }

    const { data: upsertedWinery, error: upsertError } = await supabaseClient
      .from('wineries')
      .upsert(wineryData, { onConflict: 'google_place_id' })
      .select()
      .single()

    if (upsertError) throw upsertError

    return new Response(
      JSON.stringify({ ...upsertedWinery, id: Number(upsertedWinery.id) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
