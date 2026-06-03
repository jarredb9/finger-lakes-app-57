import { Stub, stub } from "std/testing/mock.ts";

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
      if (urlStr.includes(".supabase.co")) {
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
