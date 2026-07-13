import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-skip-sw-interception',
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY or GOOGLE_MAPS_API_KEY')
    }

    let wineryId: number | undefined
    try {
      const payload = await req.json()
      wineryId = payload?.record?.winery_id || payload?.winery_id
    } catch (_e) {
      throw new Error('Invalid JSON payload')
    }

    if (!wineryId) {
      throw new Error('winery_id is required')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch the winery record
    const { data: winery, error: selectError } = await supabaseClient
      .from('wineries')
      .select('id, name, address, generative_summary, last_enriched_at')
      .eq('id', wineryId)
      .single()

    if (selectError) {
      throw new Error(`Winery not found: ${selectError.message}`)
    }

    // 2. Cache-First Check: If less than 30 days old and summary exists
    const lastEnrichedAt = winery.last_enriched_at
    const cachedSummary = winery.generative_summary as Record<string, any> | null
    const hasSummary = cachedSummary && cachedSummary.overview?.text

    if (lastEnrichedAt && hasSummary) {
      const lastDate = new Date(lastEnrichedAt)
      if (!isNaN(lastDate.getTime())) {
        const diffTime = Math.abs(new Date().getTime() - lastDate.getTime())
        const diffDays = diffTime / (1000 * 60 * 60 * 24)
        if (diffDays < 30) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Cache is fresh', 
              generative_summary: winery.generative_summary 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // 3. Query public.visits for all user_review fields where user_review is not null
    const { data: visits, error: visitsError } = await supabaseClient
      .from('visits')
      .select('user_review')
      .eq('winery_id', wineryId)
      .not('user_review', 'is', null)

    if (visitsError) {
      throw visitsError
    }

    const reviewsText = (visits || [])
      .map((v) => v.user_review)
      .filter(Boolean)
      .join('\n\n')

    // 4. Call Google Gemini API
    const prompt = reviewsText 
      ? `Summarize the following user reviews for the winery "${winery.name}" into a cohesive, concise overview summary (max 2-3 sentences):\n\n${reviewsText}`
      : `Write a cohesive, concise overview summary (max 2-3 sentences) for the winery "${winery.name}" located at "${winery.address}".`

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    })

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()
      throw new Error(`Gemini API error (${geminiResponse.status}): ${errText}`)
    }

    const geminiData = await geminiResponse.json()
    const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!summaryText) {
      throw new Error('Gemini API did not return any summary text')
    }

    const generativeSummary = { overview: { text: summaryText } }

    // 5. Update the winery's generative_summary and last_enriched_at
    const { error: updateError } = await supabaseClient
      .from('wineries')
      .update({
        generative_summary: generativeSummary,
        last_enriched_at: new Date().toISOString()
      })
      .eq('id', wineryId)

    if (updateError) {
      throw updateError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Summary updated successfully', 
        generative_summary: generativeSummary 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

// Serve the handler if not in a test environment
if (import.meta.main) {
  Deno.serve(handler)
}
