import { assertEquals } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import { generateGeminiSummary } from "../_shared/gemini.ts";
import { mockDenoEnv } from "../_shared/testing-helpers.ts";

// Stub Deno.serve prior to importing modules to avoid port 8000 collisions from top-level Deno.serve()
const serveStub = stub(Deno, "serve", () => ({ finished: Promise.resolve() } as unknown as ReturnType<typeof Deno.serve>));

const { handler: searchWineriesHandler } = await import("../search-wineries/index.ts");
const { handler: getWineryDetailsHandler } = await import("../get-winery-details/index.ts");
const { handler: sendSocialNotificationHandler } = await import("../send-social-notification/index.ts");

serveStub.restore();

/**
 * Creates a synthetic HTTP Request targeting an Edge Function handler.
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    authHeader?: string | null;
    body?: Record<string, unknown>;
  } = {}
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.authHeader !== undefined && options.authHeader !== null) {
    headers["Authorization"] = options.authHeader;
  }
  return new Request(url, {
    method: options.method || "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// ============================================================================
// 1. search-wineries Bearer Token Authentication Gate
// ============================================================================

Deno.test("search-wineries auth - returns 401 when Authorization header is missing", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response(JSON.stringify({ places: [] }), { status: 200 }))
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: { query: "test winery" },
      authHeader: null,
    });

    const res = await searchWineriesHandler(req);
    assertEquals(res.status, 401);
    const data = await res.json();
    assertEquals(data.error?.toLowerCase().includes("unauthorized"), true);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("search-wineries auth - returns 401 when Authorization Bearer token is invalid", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/auth/v1/user")) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Invalid token" }), { status: 401 })
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    }
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: { query: "test winery" },
      authHeader: "Bearer invalid-or-expired-token",
    });

    const res = await searchWineriesHandler(req);
    assertEquals(res.status, 401);
    const data = await res.json();
    assertEquals(data.error?.toLowerCase().includes("unauthorized"), true);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

// ============================================================================
// 2. get-winery-details Bearer Token Authentication Gate
// ============================================================================

Deno.test("get-winery-details auth - returns 401 when Authorization header is missing", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(
      new Response(JSON.stringify({ id: 123, google_place_id: "ChIJtest", enrichment_tier: "enriched" }), { status: 200 })
    )
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: { placeId: "ChIJtest" },
      authHeader: null,
    });

    const res = await getWineryDetailsHandler(req);
    assertEquals(res.status, 401);
    const data = await res.json();
    assertEquals(data.error?.toLowerCase().includes("unauthorized"), true);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("get-winery-details auth - returns 401 when Authorization Bearer token is invalid", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/auth/v1/user")) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Invalid token" }), { status: 401 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 123, google_place_id: "ChIJtest", enrichment_tier: "enriched" }), { status: 200 })
      );
    }
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: { placeId: "ChIJtest" },
      authHeader: "Bearer invalid-or-expired-token",
    });

    const res = await getWineryDetailsHandler(req);
    assertEquals(res.status, 401);
    const data = await res.json();
    assertEquals(data.error?.toLowerCase().includes("unauthorized"), true);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

// ============================================================================
// 3. get-winery-details Private Review Isolation & AI Opt-In Consent Guard
// ============================================================================

Deno.test("get-winery-details privacy - filters is_private=eq.false and checks ai_enabled at database seam", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  let capturedVisitsUrl = "";

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/rest/v1/wineries")) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 123, google_place_id: "ChIJtest", enrichment_tier: "basic" }), { status: 200 })
        );
      }
      if (urlStr.includes("places.googleapis.com")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            id: "ChIJtest",
            displayName: { text: "Test Winery" },
            formattedAddress: "123 Main St",
            location: { latitude: 42.1, longitude: -76.1 },
          }), { status: 200 })
        );
      }
      if (urlStr.includes("/rest/v1/visits")) {
        capturedVisitsUrl = urlStr;
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlStr.includes("/rpc/bulk_upsert_wineries")) {
        return Promise.resolve(new Response(JSON.stringify(null), { status: 200 }));
      }
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "Summary" }) }] } }]
          }), { status: 200 })
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ id: 123, google_place_id: "ChIJtest" }), { status: 200 }));
    }
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: { placeId: "ChIJtest" },
      authHeader: "Bearer valid-user-token",
    });

    await getWineryDetailsHandler(req);

    assertEquals(
      capturedVisitsUrl.includes("is_private=eq.false"),
      true,
      'URL does not include "is_private=eq.false"'
    );
    assertEquals(
      capturedVisitsUrl.includes("ai_enabled"),
      true,
      'URL does not filter for ai_enabled profiles'
    );
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("get-winery-details privacy - excludes private reviews and reviews from ai_enabled=false users from Gemini prompt", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  let capturedGeminiPromptText = "";

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/rest/v1/wineries")) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 123, google_place_id: "ChIJtest", enrichment_tier: "basic" }), { status: 200 })
        );
      }
      if (urlStr.includes("places.googleapis.com")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            id: "ChIJtest",
            displayName: { text: "Test Winery" },
            formattedAddress: "123 Main St",
            location: { latitude: 42.1, longitude: -76.1 },
          }), { status: 200 })
        );
      }
      if (urlStr.includes("/rest/v1/visits")) {
        // Mock DB returning raw rows (testing application-level and prompt isolation)
        return Promise.resolve(
          new Response(JSON.stringify([
            { user_review: "Public opted-in review: excellent dry riesling", is_private: false, ai_enabled: true },
            { user_review: "Secret private note: bad cork", is_private: true, ai_enabled: true },
            { user_review: "User opted out of AI: nice patio", is_private: false, ai_enabled: false },
          ]), { status: 200 })
        );
      }
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        try {
          const bodyObj = JSON.parse((init?.body as string) || "{}");
          capturedGeminiPromptText = bodyObj.contents?.[0]?.parts?.[0]?.text || "";
        } catch (_e) {
          // ignore json parse error
        }
        return Promise.resolve(
          new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "Summary" }) }] } }]
          }), { status: 200 })
        );
      }
      if (urlStr.includes("/rpc/bulk_upsert_wineries")) {
        return Promise.resolve(new Response(JSON.stringify(null), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ id: 123, google_place_id: "ChIJtest" }), { status: 200 }));
    }
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: { placeId: "ChIJtest" },
      authHeader: "Bearer valid-user-token",
    });

    await getWineryDetailsHandler(req);

    assertEquals(
      capturedGeminiPromptText.includes("Public opted-in review: excellent dry riesling"),
      true,
      'Prompt must include public opted-in review'
    );
    assertEquals(
      capturedGeminiPromptText.includes("Secret private note: bad cork"),
      false,
      'Prompt includes private review text "Secret private note: bad cork"'
    );
    assertEquals(
      capturedGeminiPromptText.includes("User opted out of AI: nice patio"),
      false,
      'Prompt includes review from user who opted out of AI'
    );
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

// ============================================================================
// 4. generateSmartFallback Review Sanitization, Global Scope & Freshness Guard
// ============================================================================

Deno.test("generateSmartFallback - does not copy verbatim user review snippets into summary", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
  });

  // Simulate Gemini API failure to trigger smart fallback
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("API rate limited or unavailable", { status: 500 }))
  );

  try {
    const userReview = "The tasting room had terrible loud techno music.";
    const result = await generateGeminiSummary(
      "Test Winery",
      "123 Test Rd",
      [],
      [{ user_review: userReview }]
    );

    const summaryText = result.generative_summary?.overview?.text || "";
    assertEquals(
      summaryText.includes("Guests frequently note:"),
      false,
      'Summary text includes forbidden snippet "Guests frequently note:"'
    );
    assertEquals(
      summaryText.includes(userReview),
      false,
      `Summary text copies verbatim user review snippet: "${userReview}"`
    );
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("generateSmartFallback - does not hardcode Finger Lakes copy for wineries outside FLX", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("API rate limited or unavailable", { status: 500 }))
  );

  try {
    const result = await generateGeminiSummary(
      "Château Margaux",
      "Margaux, 33460, France",
      [],
      []
    );

    const summaryText = result.generative_summary?.overview?.text || "";
    assertEquals(
      summaryText.includes("Finger Lakes"),
      false,
      'Summary text includes "Finger Lakes" for French winery'
    );
    assertEquals(
      result.vibe_tags.includes("Finger Lakes Wine"),
      false,
      'Vibe tags include "Finger Lakes Wine" for French winery'
    );
    const flxVarietals = result.varietals.some((v) => v.description?.includes("Finger Lakes"));
    assertEquals(
      flxVarietals,
      false,
      'Varietals descriptions refer to "Finger Lakes" for French winery'
    );
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("generateSmartFallback - returns explicit error indicator on fallback result", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("API rate limited or unavailable", { status: 500 }))
  );

  try {
    const result = await generateGeminiSummary(
      "Château Margaux",
      "Margaux, 33460, France",
      [],
      []
    );

    const hasError = typeof result.error === "string" && result.error.length > 0;
    assertEquals(
      hasError,
      true,
      "Expected error indicator on fallback result, but received undefined"
    );
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

// ============================================================================
// 5. send-social-notification Webhook Authorization Gate
// ============================================================================

Deno.test("send-social-notification auth - returns 401 when Authorization header is missing", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
    INTERNAL_WEBHOOK_SECRET: "correct-secret",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/rest/v1/profiles")) {
        return Promise.resolve(
          new Response(JSON.stringify({ privacy_level: "public" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: {
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "public",
        },
      },
      authHeader: null,
    });

    const res = await sendSocialNotificationHandler(req);
    assertEquals(res.status, 401);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification auth - returns 401 when Authorization secret is invalid", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
    INTERNAL_WEBHOOK_SECRET: "correct-secret",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/rest/v1/profiles")) {
        return Promise.resolve(
          new Response(JSON.stringify({ privacy_level: "public" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  );

  try {
    const req = createMockRequest("https://test.com", {
      body: {
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "public",
        },
      },
      authHeader: "Bearer wrong-secret-token",
    });

    const res = await sendSocialNotificationHandler(req);
    assertEquals(res.status, 401);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});
