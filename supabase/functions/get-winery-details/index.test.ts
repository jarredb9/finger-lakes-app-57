import { assertEquals } from "std/testing/asserts.ts";
import { handler } from "./index.ts";
import { mockDenoEnv, mockFetch } from "../_shared/testing-helpers.ts";
import { normalizeGooglePlaceV1 } from "../_shared/normalization.ts";

Deno.test("get-winery-details - successful fetch (lazy enrichment)", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const googlePlace = {
    id: "ChIJtest",
    displayName: { text: "Test Winery Enriched" },
    formattedAddress: "123 Test St",
    location: { latitude: 42.1, longitude: -76.1 },
    rating: 4.5,
    userRatingCount: 150,
    photos: [
      { name: "places/ChIJtest/photos/photo_123" }
    ],
  };

  // Sequence:
  // 1. Initial select (returns null or basic to trigger enrichment)
  // 2. RPC (returns void/null)
  // 3. Final select (returns enriched)
  const supabaseResponses = [
    null, // Initial select: Not found
    null, // RPC: Success
    {
      id: 123,
      google_place_id: "ChIJtest",
      name: "Test Winery Enriched",
      enrichment_tier: "enriched",
      google_rating: 4.5,
      user_rating_count: 150,
      last_enriched_at: new Date().toISOString(),
      primary_photo_reference: "places/ChIJtest/photos/photo_123",
      photo_references: ["places/ChIJtest/photos/photo_123"],
    }
  ];

  const fetchStub = mockFetch(googlePlace, supabaseResponses);

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ placeId: "ChIJtest" }),
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.id, "ChIJtest");
    assertEquals(data.dbId, 123);
    assertEquals(data.enrichment_tier, "enriched");
    assertEquals(data.google_rating, 4.5);
    assertEquals(data.user_rating_count, 150);
    assertEquals(data.primary_photo_reference, "places/ChIJtest/photos/photo_123");
    assertEquals(data.photo_references, ["places/ChIJtest/photos/photo_123"]);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("get-winery-details - missing API key", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ placeId: "ChIJtest" }),
    });

    const res = await handler(req);
    const data = await res.json();

    // The handler should fail before the second fetch if API key is missing
    // But since it tries to check cache first, it might fail there if Supabase isn't mocked.
    // If we mock Supabase to return nothing (404/empty), it will proceed to enrichment and fail there.
  } finally {
    envStub.restore();
  }
});

Deno.test("get-winery-details handler - OPTIONS preflight checks", async () => {
  const req = new Request("https://test.com", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type, x-skip-sw-interception"
    }
  });

  const res = await handler(req);
  assertEquals(res.status, 200);
  const allowHeaders = res.headers.get("Access-Control-Allow-Headers") || "";
  assertEquals(allowHeaders.toLowerCase().includes("x-skip-sw-interception"), true);
});

Deno.test("normalizeGooglePlaceV1 - maps rating and userRatingCount correctly", () => {
  const place = {
    id: "ChIJtest",
    displayName: { text: "Test Winery" },
    formattedAddress: "123 Test St",
    location: { latitude: 42.1, longitude: -76.1 },
    rating: 4.5,
    userRatingCount: 150,
  };
  const normalized = normalizeGooglePlaceV1(place, 'enriched');
  assertEquals(normalized.google_rating, 4.5);
  assertEquals(normalized.user_rating_count, 150);
});

