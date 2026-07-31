import { createClient } from "@supabase/supabase-js"
import { ENRICHMENT_FIELD_MASK } from "../_shared/google-maps.ts"
import { shouldEnrich } from "../_shared/enrichment.ts"
import { normalizeGooglePlaceV1 } from "../_shared/normalization.ts"
import { generateGeminiSummary } from "../_shared/gemini.ts"

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

    // 2. Fetch from Google V1 Places API
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

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google Places API error (${response.status}): ${errorText}`)
    }

    const place = await response.json()
    if (place.error) throw new Error(place.error.message)

    // 3. Normalize place data
    const wineryData = normalizeGooglePlaceV1(place, 'enriched')

    // 4. Fetch any existing in-app reviews for this winery if db record exists
    let appReviews: Array<{ user_review: string }> = []
    if (winery?.id) {
      const { data: visits } = await supabaseClient
        .from('visits')
        .select('user_review')
        .eq('winery_id', winery.id)
        .not('user_review', 'is', null)

      if (visits) {
        appReviews = visits as Array<{ user_review: string }>
      }
    }

    // 5. Generate Gemini AI Summary, Vibe Tags, and Varietals
    const geminiResult = await generateGeminiSummary(
      wineryData.name,
      wineryData.address,
      wineryData.reviews || [],
      appReviews
    )

    if (geminiResult.generative_summary) {
      wineryData.generative_summary = geminiResult.generative_summary
    }
    if (geminiResult.vibe_tags && geminiResult.vibe_tags.length > 0) {
      wineryData.vibe_tags = geminiResult.vibe_tags
    }
    if (geminiResult.varietals && geminiResult.varietals.length > 0) {
      wineryData.varietals = geminiResult.varietals
    }

    // Only set last_enriched_at if Gemini AI enrichment succeeded to avoid getting stuck in a half-enriched state
    if (!geminiResult.generative_summary) {
      wineryData.last_enriched_at = null;
    }

    // 6. Upsert via Hybrid Pattern (RPC)
    const { error: upsertError } = await supabaseClient.rpc('bulk_upsert_wineries', {
      p_wineries_data: [wineryData]
    })

    if (upsertError) throw upsertError

    // 7. Fetch the updated record to return to client
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
