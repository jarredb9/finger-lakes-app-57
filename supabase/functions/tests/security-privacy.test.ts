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

function stubSocialSupabaseFetch(options: {
  activityLedger?: { id: string; user_id: string; privacy_level: string } | null;
  profile?: { privacy_level: string } | null;
  follows?: Array<{ follower_id: string }>;
  friends1?: Array<{ user2_id: string }>;
  friends2?: Array<{ user1_id: string }>;
} = {}) {
  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/rest/v1/activity_ledger")) {
        return Promise.resolve(
          new Response(JSON.stringify(options.activityLedger ?? null), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (urlStr.includes("/rest/v1/profiles")) {
        return Promise.resolve(
          new Response(JSON.stringify(options.profile ?? { privacy_level: "public" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (urlStr.includes("/rest/v1/follows")) {
        return Promise.resolve(
          new Response(JSON.stringify(options.follows ?? []), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (urlStr.includes("/rest/v1/friends")) {
        const isUser1 = urlStr.includes("user1_id=eq.");
        return Promise.resolve(
          new Response(
            JSON.stringify(isUser1 ? (options.friends1 ?? []) : (options.friends2 ?? [])),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }
      return Promise.reject(new Error(`Unhandled fetch to ${urlStr}`));
    }
  );
}

Deno.test("send-social-notification auth - accepts INTERNAL_WEBHOOK_SECRET, WEBHOOK_SECRET, and SUPABASE_SERVICE_ROLE_KEY", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
    INTERNAL_WEBHOOK_SECRET: "internal-secret-value",
    WEBHOOK_SECRET: "webhook-secret-value",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: { id: "activity-1", user_id: "user-1", privacy_level: "public" },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
  });

  try {
    for (const token of [
      "internal-secret-value",
      "webhook-secret-value",
      "service-role-secret-value",
    ]) {
      const req = createMockRequest("https://test.com", {
        body: {
          record: {
            id: "activity-1",
            user_id: "user-1",
            privacy_level: "public",
          },
        },
        authHeader: `Bearer ${token}`,
      });

      const res = await sendSocialNotificationHandler(req);
      const data = await res.json();
      assertEquals(res.status, 200, `Expected 200 for configured secret token`);
      assertEquals(data.success, true);
      assertEquals(data.count, 1);
      assertEquals("notified" in data, false);
    }
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification auth - returns 401 for malformed headers and prefix/suffix/length mismatches", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-long",
    INTERNAL_WEBHOOK_SECRET: "correct-secret",
    WEBHOOK_SECRET: "webhook-secret-12345",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: { id: "activity-1", user_id: "user-1", privacy_level: "public" },
  });

  try {
    const invalidHeaders = [
      "Bearer",
      "Bearer   ",
      "Basic dXNlcjpwYXNz",
      "Bearer correct",
      "Bearer correct-secret-extra",
      "Bearer webhook-secret-1234",
      "Bearer service-role-secret-lon",
    ];

    for (const authHeader of invalidHeaders) {
      const req = createMockRequest("https://test.com", {
        body: { record: { id: "activity-1" } },
        authHeader,
      });

      const res = await sendSocialNotificationHandler(req);
      const data = await res.json();
      assertEquals(res.status, 401, `Expected 401 for header: ${authHeader}`);
      assertEquals(typeof data.error === "string" && /unauthorized/i.test(data.error), true);
    }
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification auth - returns 401 when no authorization secrets are configured", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: { id: "activity-1", user_id: "user-1", privacy_level: "public" },
  });

  try {
    for (const authHeader of ["Bearer ", "Bearer any-token"]) {
      const req = createMockRequest("https://test.com", {
        body: { record: { id: "activity-1" } },
        authHeader,
      });

      const res = await sendSocialNotificationHandler(req);
      const data = await res.json();
      assertEquals(res.status, 401);
      assertEquals(typeof data.error === "string" && /unauthorized/i.test(data.error), true);
    }
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification ledger - returns 400 when record.id is missing and issues zero DB queries", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
    WEBHOOK_SECRET: "webhook-secret",
  });

  const fetchStub = stubSocialSupabaseFetch();

  try {
    const payloads = [
      {},
      { record: {} },
      { record: { id: "" } },
      { record: { user_id: "user-1", privacy_level: "public" } },
    ];

    for (const body of payloads) {
      const req = createMockRequest("https://test.com", {
        body,
        authHeader: "Bearer webhook-secret",
      });

      const res = await sendSocialNotificationHandler(req);
      assertEquals(res.status, 400);
    }

    assertEquals(fetchStub.calls.length, 0);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification ledger - returns 404 when activity_ledger row does not exist without querying graph tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
    INTERNAL_WEBHOOK_SECRET: "correct-secret",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: null,
  });

  try {
    const req = createMockRequest("https://test.com", {
      body: {
        record: {
          id: "missing-activity-id",
          user_id: "spoofed-user",
          privacy_level: "public",
        },
      },
      authHeader: "Bearer correct-secret",
    });

    const res = await sendSocialNotificationHandler(req);
    assertEquals(res.status, 404);

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString());
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/activity_ledger")), true);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles")), false);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows")), false);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/friends")), false);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification ledger - returns 400 when payload record.user_id mismatches authoritative ledger row", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: {
      id: "activity-1",
      user_id: "real-owner-id",
      privacy_level: "public",
    },
  });

  try {
    const req = createMockRequest("https://test.com", {
      body: {
        record: {
          id: "activity-1",
          user_id: "spoofed-user-id",
          privacy_level: "public",
        },
      },
      authHeader: "Bearer test-role-key",
    });

    const res = await sendSocialNotificationHandler(req);
    assertEquals(res.status, 400);

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString());
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/activity_ledger")), true);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles")), false);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows")), false);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/friends")), false);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification privacy - enforces authoritative activity_ledger.privacy_level over spoofed payload", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "private",
    },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "11111111-1111-4111-8111-111111111111" }],
  });

  try {
    const req = createMockRequest("https://test.com", {
      body: {
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "public",
        },
      },
      authHeader: "Bearer test-role-key",
    });

    const res = await sendSocialNotificationHandler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.count, 0);
    assertEquals(data.message, "Activity is private, no notifications sent.");
    assertEquals("notified" in data, false);

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString());
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles")), false);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows")), false);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/friends")), false);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification privacy - omits notified array and all friend-graph UUIDs from HTTP response", async () => {
  const actorUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const followerUuid = "11111111-1111-4111-8111-111111111111";
  const friend1Uuid = "22222222-2222-4222-8222-222222222222";
  const friend2Uuid = "33333333-3333-4333-8333-333333333333";

  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = stubSocialSupabaseFetch({
    activityLedger: {
      id: "activity-1",
      user_id: actorUuid,
      privacy_level: "public",
    },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: followerUuid }],
    friends1: [{ user2_id: friend1Uuid }],
    friends2: [{ user1_id: friend2Uuid }],
  });

  try {
    const req = createMockRequest("https://test.com", {
      body: {
        record: {
          id: "activity-1",
          user_id: actorUuid,
          privacy_level: "public",
        },
      },
      authHeader: "Bearer test-role-key",
    });

    const res = await sendSocialNotificationHandler(req);
    const data = await res.json();
    const serialized = JSON.stringify(data);

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.count, 3);
    assertEquals("notified" in data, false);
    assertEquals(data.notified, undefined);
    assertEquals(serialized.includes(actorUuid), false);
    assertEquals(serialized.includes(followerUuid), false);
    assertEquals(serialized.includes(friend1Uuid), false);
    assertEquals(serialized.includes(friend2Uuid), false);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});
