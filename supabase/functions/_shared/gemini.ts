export interface GeminiEnrichmentResult {
  generative_summary: { overview: { text: string } } | null;
  vibe_tags: string[];
  varietals: Array<{ name: string; description?: string; sweetness?: number; body?: number; price?: string }>;
}

export async function generateGeminiSummary(
  wineryName: string,
  address: string,
  googleReviews: Array<{ text: string }> = [],
  appReviews: Array<{ user_review: string }> = []
): Promise<GeminiEnrichmentResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    console.warn('[Gemini] Missing GEMINI_API_KEY or GOOGLE_MAPS_API_KEY, skipping AI enrichment');
    return { generative_summary: null, vibe_tags: [], varietals: [] };
  }

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
You MUST respond with a JSON object. Do not include markdown code block formatting (like \`\`\`json). The JSON structure must be:
{
  "summary": "Your 2-3 sentence summary here",
  "vibe_tags": ["Tag 1", "Tag 2", "Tag 3"],
  "varietals": [
    { "name": "Dry Riesling", "description": "Crisp white wine with bright citrus acidity", "sweetness": 2, "body": 3 }
  ]
}`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
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
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.warn(`[Gemini] API error (${geminiResponse.status}): ${errText}`);
      return { generative_summary: null, vibe_tags: [], varietals: [] };
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!rawText) {
      console.warn('[Gemini] API did not return any content');
      return { generative_summary: null, vibe_tags: [], varietals: [] };
    }

    let summaryText = '';
    let vibeTags: string[] = [];
    let varietals: Array<{ name: string; description?: string; sweetness?: number; body?: number; price?: string }> = [];

    try {
      const cleanedJson = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanedJson);
      summaryText = parsed.summary || '';
      vibeTags = Array.isArray(parsed.vibe_tags) ? parsed.vibe_tags : [];
      varietals = Array.isArray(parsed.varietals) ? parsed.varietals : [];
    } catch (_e) {
      summaryText = rawText;
    }

    return {
      generative_summary: summaryText ? { overview: { text: summaryText } } : null,
      vibe_tags: vibeTags,
      varietals: varietals
    };
  } catch (err) {
    console.error('[Gemini] Error generating summary:', err);
    return { generative_summary: null, vibe_tags: [], varietals: [] };
  }
}
