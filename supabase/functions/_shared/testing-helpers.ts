import { Stub, stub } from "std/testing/mock.ts";

/**
 * Mocking utility for fetch calls to Google Places API
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
