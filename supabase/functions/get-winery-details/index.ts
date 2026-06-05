import { createClient } from "@supabase/supabase-js"
import { ENRICHMENT_FIELD_MASK } from "../_shared/google-maps.ts"
import { shouldEnrich } from "../_shared/enrichment.ts"
import { normalizeGooglePlaceV1 } from "../_shared/normalization.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-skip-sw-interception',
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

    // 3. Normalize & Upsert via Hybrid Pattern (RPC)
    const wineryData = normalizeGooglePlaceV1(place, 'enriched')

    const { error: upsertError } = await supabaseClient.rpc('bulk_upsert_wineries', {
      p_wineries_data: [wineryData]
    })

    if (upsertError) throw upsertError

    // 4. Fetch the updated record to return to client (ensures ID and Revision Control fields are included)
    const { data: updatedWinery, error: fetchError } = await supabaseClient
      .from('wineries')
      .select('*')
      .eq('google_place_id', placeId)
      .single()

    if (fetchError) throw fetchError

    return new Response(
      JSON.stringify({ 
        ...updatedWinery, 
        id: updatedWinery.google_place_id, 
        dbId: Number(updatedWinery.id) 
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
