import { Stub, stub } from "jsr:@std/testing/mock";

export const VALID_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];

function extractHeader(url: string | URL | Request, init: RequestInit | undefined, name: string): string | null {
  const target = name.toLowerCase();
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      return init.headers.get(target);
    }
    if (Array.isArray(init.headers)) {
      const match = init.headers.find(([k]) => k.toLowerCase() === target);
      return match ? match[1] : null;
    }
    for (const [k, v] of Object.entries(init.headers)) {
      if (k.toLowerCase() === target) return v as string;
    }
  }
  if (url instanceof Request) {
    return url.headers.get(target);
  }
  return null;
}

/**
 * Enhanced mock for fetch that handles both Google and Supabase URLs
 */
export function mockFetch(
  googleResponse: any,
  supabaseResponses: any[] | any,
  geminiResponse?: { status?: number; data?: any }
): Stub {
  let supabaseCallCount = 0;
  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("places.googleapis.com")) {
        return Promise.resolve(
          new Response(JSON.stringify(googleResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        // 1. Model Registry Validation
        const modelMatch = urlStr.match(/\/models\/([^:?]+):generateContent/);
        const model = modelMatch ? modelMatch[1] : null;
        if (!model || !VALID_GEMINI_MODELS.includes(model)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: 404,
                  message: `models/${model || 'unknown'} is not found for API version v1beta, or is not supported for generateContent.`,
                  status: "NOT_FOUND",
                },
              }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              }
            )
          );
        }

        // 2. Auth Header / Param Validation
        const authHeader = extractHeader(url, init, 'authorization');
        const apiKeyHeader = extractHeader(url, init, 'x-goog-api-key');
        let queryKey: string | null = null;
        try {
          const parsed = new URL(urlStr);
          queryKey = parsed.searchParams.get('key');
        } catch (_e) {
          // ignore
        }

        if (authHeader) {
          if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace(/^Bearer\s+/i, '').trim();
            if (!token.startsWith('ya29.')) {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    error: {
                      code: 401,
                      message: "API keys are not supported by this API. Expected OAuth2 access token or pass key in x-goog-api-key.",
                      status: "UNAUTHENTICATED",
                    },
                  }),
                  {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                  }
                )
              );
            }
          }
        } else {
          const effectiveKey = apiKeyHeader || queryKey;
          if (!effectiveKey) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  error: {
                    code: 401,
                    message: "API key not valid. Please pass a valid API key.",
                    status: "UNAUTHENTICATED",
                  },
                }),
                {
                  status: 401,
                  headers: { "Content-Type": "application/json" },
                }
              )
            );
          }
        }

        // 3. Custom / Simulated Gemini response if provided
        if (geminiResponse?.status && geminiResponse.status !== 200) {
          return Promise.resolve(
            new Response(
              JSON.stringify(geminiResponse.data || { error: { code: geminiResponse.status, message: "Simulated Gemini error" } }),
              {
                status: geminiResponse.status,
                headers: { "Content-Type": "application/json" },
              }
            )
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify(
              geminiResponse?.data || {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          text: JSON.stringify({
                            summary: "A lovely winery summary.",
                            vibe_tags: ["Riesling Specialist", "Dog Friendly"],
                            varietals: [{ name: "Dry Riesling", sweetness: 2, body: 3 }],
                          }),
                        },
                      ],
                    },
                  },
                ],
              }
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }
      if (urlStr.includes("/auth/v1/user")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "mock-user-id", email: "test@example.com" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }
      if (urlStr.includes(".supabase.co") || urlStr.includes("127.0.0.1:54321") || urlStr.includes("localhost:54321")) {
        const response = Array.isArray(supabaseResponses) 
          ? (supabaseCallCount < supabaseResponses.length
              ? supabaseResponses[supabaseCallCount]
              : supabaseResponses[supabaseResponses.length - 1])
          : supabaseResponses;
        supabaseCallCount++;
        
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.reject(new Error(`Unhandled fetch to ${urlStr}`));
    }
  );
}

/**
 * Mocking utility for fetch calls to Google Places API
 * @deprecated Use mockFetch for more precise control
 */
export function mockGooglePlacesResponse(responseData: any): Stub {
  return stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
  );
}

/**
 * Mocking utility for Deno.env
 */
export function mockDenoEnv(vars: Record<string, string>): Stub {
  return stub(Deno.env, "get", (key: string) => vars[key] || undefined);
}
