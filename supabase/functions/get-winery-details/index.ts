import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { placeId } = await req.json()

    if (!placeId) {
      return new Response(
        JSON.stringify({ error: 'placeId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 1. Check if winery exists in DB
    const { data: existingWinery, error: selectError } = await supabaseClient
      .from('wineries')
      .select('*')
      .eq('google_place_id', placeId)
      .single()

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('Database error:', selectError)
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Check if we have "full" details (simple heuristic based on your API route logic)
    if (existingWinery && 
        existingWinery.phone && 
        existingWinery.website && 
        existingWinery.google_rating && 
        existingWinery.opening_hours !== null && 
        existingWinery.reviews !== null) {
      return new Response(
        JSON.stringify(existingWinery),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 2. Fetch from Google Places API
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Maps API Key is not configured.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating,opening_hours,reviews&key=${apiKey}`

    const googleResponse = await fetch(url)
    const googleData = await googleResponse.json()

    if (googleData.status !== 'OK') {
      console.error('Google Places API error:', googleData)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Google Places API', details: googleData.status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const placeDetails = googleData.result

    if (!placeDetails || !placeDetails.name || !placeDetails.formatted_address) {
      return new Response(
        JSON.stringify({ error: 'Incomplete place details from Google' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const wineryData = {
      google_place_id: placeId,
      name: placeDetails.name,
      address: placeDetails.formatted_address,
      latitude: placeDetails.geometry?.location?.lat,
      longitude: placeDetails.geometry?.location?.lng,
      phone: placeDetails.formatted_phone_number ? placeDetails.formatted_phone_number.substring(0, 50) : null,
      website: placeDetails.website ? placeDetails.website.substring(0, 500) : null,
      google_rating: placeDetails.rating,
      opening_hours: placeDetails.opening_hours ? JSON.parse(JSON.stringify(placeDetails.opening_hours)) : null,
      reviews: placeDetails.reviews ? placeDetails.reviews.slice(0, 5) : null,
    }

    // 3. Upsert into DB
    const { data: upsertedWinery, error: upsertError } = await supabaseClient
      .from('wineries')
      .upsert(wineryData, { onConflict: 'google_place_id' })
      .select()
      .single()

    if (upsertError) {
      console.error('Upsert error:', upsertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save winery details' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify(upsertedWinery),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
