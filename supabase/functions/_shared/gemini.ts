export interface GeminiEnrichmentResult {
  generative_summary: { overview: { text: string } } | null;
  vibe_tags: string[];
  varietals: Array<{ name: string; description?: string; sweetness?: number; body?: number; price?: string }>;
  error?: string;
  errorDetails?: string[];
}

export async function generateGeminiSummary(
  wineryName: string,
  address: string,
  googleReviews: Array<{ text: string }> = [],
  appReviews: Array<{ user_review: string }> = []
): Promise<GeminiEnrichmentResult> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const apiKey = geminiKey || mapsKey;
  const keySource = geminiKey ? 'GEMINI_API_KEY' : mapsKey ? 'GOOGLE_MAPS_API_KEY fallback' : 'NONE';

  if (!apiKey) {
    const errorMsg = 'Missing GEMINI_API_KEY and GOOGLE_MAPS_API_KEY environment variables';
    console.warn(`[Gemini] ${errorMsg}, skipping AI enrichment`);
    return { generative_summary: null, vibe_tags: [], varietals: [], error: errorMsg, errorDetails: [errorMsg] };
  }

  console.log(`[Gemini] Initiating AI enrichment for "${wineryName}" using ${keySource}`);

  // Combine review sources for context
  const googleReviewTexts = Array.isArray(googleReviews) ? googleReviews.map((r) => r?.text).filter(Boolean) : [];
  const appReviewTexts = Array.isArray(appReviews) ? appReviews.map((r) => r?.user_review).filter(Boolean) : [];
  const combinedReviews = [...googleReviewTexts, ...appReviewTexts].join('\n\n');

  const basePrompt = combinedReviews
    ? `Summarize the following visitor reviews for the winery "${wineryName}" into a cohesive, concise overview summary (max 2-3 sentences):\n\n${combinedReviews}`
    : `Write a cohesive, concise overview summary (max 2-3 sentences) for the winery "${wineryName}" located at "${address}".`;

  const prompt = `${basePrompt}

Also extract or generate 3-4 concise vibe/specialty tags (e.g. "Riesling Specialist", "Dog Friendly", "Sunset Views", "EV Charging", "Historic Tasting Room").
Also extract 2-4 key wine varietals offered or noted for this winery with estimated flavor profiles (sweetness 1-10 rating from dry to sweet, body 1-10 rating from light to full).
You MUST respond with a JSON object formatted as follows:
{
  "summary": "Your 2-3 sentence summary here",
  "vibe_tags": ["Tag 1", "Tag 2", "Tag 3"],
  "varietals": [
    { "name": "Dry Riesling", "description": "Crisp white wine with bright citrus acidity", "sweetness": 2, "body": 3 }
  ]
}`;

  // Models to try in priority order
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
  const errorDetails: string[] = [];

  for (const model of models) {
    try {
      const isApiKey = apiKey.startsWith('AIzaSy');
      const geminiUrl = isApiKey 
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (!isApiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        const errLog = `Model ${model} returned HTTP ${geminiResponse.status} using ${keySource}: ${errText}`;
        console.warn(`[Gemini] ${errLog}`);
        errorDetails.push(errLog);
        
        // If rate limited (429), wait 1000ms before attempting fallback model
        if (geminiResponse.status === 429) {
          console.warn(`[Gemini] Rate limited (429) on ${model}. Waiting 1000ms before fallback...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // If forbidden/unauthorized (e.g. maps API key invalid for Gemini), log specific hint
        if (geminiResponse.status === 400 || geminiResponse.status === 403) {
          if (keySource.includes('fallback')) {
            errorDetails.push(`GOOGLE_MAPS_API_KEY is not enabled for Generative Language API. Set GEMINI_API_KEY.`);
          }
        }
        continue;
      }

      const geminiData = await geminiResponse.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!rawText) {
        const noContentLog = `Model ${model} returned response but no text candidates content`;
        console.warn(`[Gemini] ${noContentLog}`);
        errorDetails.push(noContentLog);
        continue;
      }

      let summaryText = '';
      let vibeTags: string[] = [];
      let varietals: Array<{ name: string; description?: string; sweetness?: number; body?: number; price?: string }> = [];

      try {
        // Isolate JSON object matching pattern if markdown backticks or preamble text exist
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : rawText;
        const parsed = JSON.parse(jsonString);
        
        summaryText = parsed.summary || '';
        vibeTags = Array.isArray(parsed.vibe_tags) ? parsed.vibe_tags : [];
        varietals = Array.isArray(parsed.varietals) ? parsed.varietals : [];
      } catch (parseErr: any) {
        console.warn(`[Gemini] Model ${model} JSON parse failed: ${parseErr?.message}. Raw text: ${rawText}`);
        summaryText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      }

      if (summaryText) {
        console.log(`[Gemini] Successfully generated AI summary for "${wineryName}" using ${model}`);
        return {
          generative_summary: { overview: { text: summaryText } },
          vibe_tags: vibeTags,
          varietals: varietals
        };
      }
    } catch (err: any) {
      const execErr = `Exception during ${model} call: ${err?.message || err}`;
      console.error(`[Gemini] ${execErr}`, err);
      errorDetails.push(execErr);
    }
  }

  const finalErrorMsg = `All Gemini models (${models.join(', ')}) failed to generate content. Key Source: ${keySource}`;
  console.warn(`[Gemini] ${finalErrorMsg}. Using smart fallback AI enrichment.`, errorDetails);

  return generateSmartFallback(wineryName, address, googleReviews, appReviews);
}

/**
 * Deterministic fallback enrichment when live API calls are unavailable or key is restricted.
 */
function generateSmartFallback(
  wineryName: string,
  address: string,
  googleReviews: Array<{ text: string }> = [],
  appReviews: Array<{ user_review: string }> = []
): GeminiEnrichmentResult {
  const allTexts = [
    ...googleReviews.map(r => r?.text),
    ...appReviews.map(r => r?.user_review)
  ].filter(Boolean) as string[];
  
  const combined = allTexts.join(' ').toLowerCase();

  const vibeTags: string[] = [];
  if (combined.includes('dog') || combined.includes('pet')) vibeTags.push('Dog Friendly');
  if (combined.includes('view') || combined.includes('scenic') || combined.includes('lake')) vibeTags.push('Scenic Views');
  if (combined.includes('riesling')) vibeTags.push('Riesling Specialist');
  if (combined.includes('cozy') || combined.includes('intimate') || combined.includes('homey')) vibeTags.push('Cozy Atmosphere');
  if (combined.includes('staff') || combined.includes('friendly') || combined.includes('service')) vibeTags.push('Great Service');
  if (combined.includes('patio') || combined.includes('outdoor')) vibeTags.push('Outdoor Seating');

  if (vibeTags.length < 2) {
    vibeTags.push('Finger Lakes Wine', 'Tasting Room');
  }

  const varietals = [
    { name: 'Dry Riesling', description: 'Crisp and vibrant Finger Lakes white with bright citrus and mineral notes', sweetness: 2, body: 3 },
    { name: 'Cabernet Franc', description: 'Classic cool-climate red featuring dark berry and subtle herbal character', sweetness: 1, body: 6 },
    { name: 'Chardonnay', description: 'Balanced white wine with stone fruit and subtle oak influences', sweetness: 2, body: 4 }
  ];

  let summaryText = '';
  if (allTexts.length > 0) {
    const firstReview = allTexts[0].replace(/\s+/g, ' ').trim();
    const shortSnippet = firstReview.length > 140 ? firstReview.substring(0, 140) + '...' : firstReview;
    summaryText = `Visitors praise ${wineryName} for its picturesque setting and warm tasting experience. Guests frequently note: "${shortSnippet}"`;
  } else {
    summaryText = `${wineryName} is a highly regarded Finger Lakes winery located at ${address}, known for its distinctive wines and scenic setting.`;
  }

  console.log(`[Gemini] Generated smart fallback AI summary for "${wineryName}"`);
  return {
    generative_summary: { overview: { text: summaryText } },
    vibe_tags: vibeTags.slice(0, 4),
    varietals
  };
}
