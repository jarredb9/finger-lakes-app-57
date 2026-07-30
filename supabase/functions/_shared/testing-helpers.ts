import { Stub, stub } from "jsr:@std/testing/mock";

/**
 * Enhanced mock for fetch that handles both Google and Supabase URLs
 */
export function mockFetch(googleResponse: any, supabaseResponses: any[] | any): Stub {
  let supabaseCallCount = 0;
  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
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
        return Promise.resolve(
          new Response(
            JSON.stringify({
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
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }
      if (urlStr.includes(".supabase.co") || urlStr.includes("127.0.0.1:54321") || urlStr.includes("localhost:54321")) {
        const response = Array.isArray(supabaseResponses) 
          ? (supabaseResponses[supabaseCallCount] || supabaseResponses[supabaseResponses.length - 1])
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
