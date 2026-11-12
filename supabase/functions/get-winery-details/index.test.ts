import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import { handler } from "./index.ts";
import { mockDenoEnv, mockFetch } from "../_shared/testing-helpers.ts";
import { normalizeGooglePlaceV1 } from "../_shared/normalization.ts";
import { shouldEnrich } from "../_shared/enrichment.ts";

Deno.test("get-winery-details - successful fetch (lazy enrichment)", async () => {
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: "AQ.test-key-mock-12345",
    GOOGLE_MAPS_API_KEY: "AIzaSyDtRMuqE7KeLC_mock",
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
      headers: { Authorization: "Bearer test-jwt-token" },
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

    // Assert bulk_upsert_wineries RPC payload
    const rpcCall = fetchStub.calls.find((call) =>
      call.args[0].toString().includes("/rpc/bulk_upsert_wineries")
    );
    assertNotEquals(rpcCall, undefined, "bulk_upsert_wineries RPC was not invoked");
    const rpcBody = JSON.parse(rpcCall!.args[1]?.body as string);
    const upsertedWinery = rpcBody.p_wineries_data[0];
    assertNotEquals(upsertedWinery.last_enriched_at, null, "last_enriched_at should be set on successful enrichment");
    assertNotEquals(upsertedWinery.generative_summary, null, "generative_summary should be present on success");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("get-winery-details - Gemini enrichment failure leaves last_enriched_at as null and does not save fallback boilerplate", async () => {
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: "AQ.test-key-mock-12345",
    GOOGLE_MAPS_API_KEY: "AIzaSyDtRMuqE7KeLC_mock",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const googlePlace = {
    id: "ChIJtest",
    displayName: { text: "Test Winery Gemini Down" },
    formattedAddress: "123 Test St",
    location: { latitude: 42.1, longitude: -76.1 },
    rating: 4.5,
    userRatingCount: 150,
  };

  const supabaseResponses = [
    null, // Initial select: not found
    null, // RPC: Success
    {
      id: 123,
      google_place_id: "ChIJtest",
      name: "Test Winery Gemini Down",
      enrichment_tier: "enriched",
      last_enriched_at: null,
      generative_summary: null,
    }
  ];

  // Simulate Gemini API outage (500)
  const fetchStub = mockFetch(googlePlace, supabaseResponses, {
    status: 500,
    data: { error: { code: 500, message: "Gemini server error" } }
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt-token" },
      body: JSON.stringify({ placeId: "ChIJtest" }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);

    const rpcCall = fetchStub.calls.find((call) =>
      call.args[0].toString().includes("/rpc/bulk_upsert_wineries")
    );
    assertNotEquals(rpcCall, undefined, "bulk_upsert_wineries RPC was not invoked");
    const rpcBody = JSON.parse(rpcCall!.args[1]?.body as string);
    const upsertedWinery = rpcBody.p_wineries_data[0];

    assertEquals(upsertedWinery.last_enriched_at, null, "last_enriched_at must be null when Gemini fails");
    assertEquals(upsertedWinery.generative_summary, null, "fallback boilerplate must not be written to database on failure");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("get-winery-details - Gemini failure preserves existing genuine summary and sets last_enriched_at to null", async () => {
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: "AQ.test-key-mock-12345",
    GOOGLE_MAPS_API_KEY: "AIzaSyDtRMuqE7KeLC_mock",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const googlePlace = {
    id: "ChIJtest",
    displayName: { text: "Test Winery Existing Genuine" },
    formattedAddress: "123 Test St",
    location: { latitude: 42.1, longitude: -76.1 },
    rating: 4.5,
    userRatingCount: 150,
  };

  const existingGenuineSummary = { overview: { text: "Hand-crafted dry riesling with slate minerality." } };

  const supabaseResponses = [
    {
      id: 123,
      google_place_id: "ChIJtest",
      name: "Test Winery Existing Genuine",
      enrichment_tier: "basic",
      last_enriched_at: null,
      generative_summary: existingGenuineSummary,
    },
    null, // RPC: Success
    {
      id: 123,
      google_place_id: "ChIJtest",
      name: "Test Winery Existing Genuine",
      enrichment_tier: "enriched",
      last_enriched_at: null,
      generative_summary: existingGenuineSummary,
    }
  ];

  // Simulate Gemini API outage (500)
  const fetchStub = mockFetch(googlePlace, supabaseResponses, {
    status: 500,
    data: { error: { code: 500, message: "Gemini server error" } }
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt-token" },
      body: JSON.stringify({ placeId: "ChIJtest" }),
    });

    const res = await handler(req);
    assertEquals(res.status, 200);

    const rpcCall = fetchStub.calls.find((call) =>
      call.args[0].toString().includes("/rpc/bulk_upsert_wineries")
    );
    assertNotEquals(rpcCall, undefined, "bulk_upsert_wineries RPC was not invoked");
    const rpcBody = JSON.parse(rpcCall!.args[1]?.body as string);
    const upsertedWinery = rpcBody.p_wineries_data[0];

    assertEquals(upsertedWinery.last_enriched_at, null, "last_enriched_at must be null when Gemini fails");
    assertEquals(
      upsertedWinery.generative_summary?.overview?.text,
      "Hand-crafted dry riesling with slate minerality.",
      "existing genuine summary must be preserved when Gemini fails"
    );
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
  const fetchStub = mockFetch(null, null);

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-jwt-token" },
      body: JSON.stringify({ placeId: "ChIJtest" }),
    });

    const res = await handler(req);
    const data = await res.json();

    // The handler should fail before the second fetch if API key is missing
    // But since it tries to check cache first, it might fail there if Supabase isn't mocked.
    // If we mock Supabase to return nothing (404/empty), it will proceed to enrichment and fail there.
  } finally {
    envStub.restore();
    fetchStub.restore();
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

Deno.test("normalizeGooglePlaceV1 - normalizes zero and undefined rating to null", () => {
  const placeWithoutRating = {
    id: "ChIJunrated",
    displayName: { text: "Unrated Winery" },
    formattedAddress: "456 Test St",
    location: { latitude: 42.2, longitude: -76.2 },
  };
  const normalized1 = normalizeGooglePlaceV1(placeWithoutRating, 'basic');
  assertEquals(normalized1.google_rating, null);
  assertEquals(normalized1.user_rating_count, null);

  const placeWithZero = {
    ...placeWithoutRating,
    rating: 0,
    userRatingCount: 0,
  };
  const normalized2 = normalizeGooglePlaceV1(placeWithZero, 'basic');
  assertEquals(normalized2.google_rating, null);
  assertEquals(normalized2.user_rating_count, null);
});

Deno.test("shouldEnrich - respects freshness for unrated wineries with null ratings", () => {
  const freshUnratedWinery = {
    enrichment_tier: 'enriched',
    reviews: [],
    user_rating_count: null,
    google_rating: null,
    generative_summary: 'AI summary',
    primary_photo_reference: 'photo_ref_123',
    last_enriched_at: new Date().toISOString(),
  };
  assertEquals(shouldEnrich(freshUnratedWinery), false);

  const corruptedWineryWithZero = {
    ...freshUnratedWinery,
    google_rating: 0,
  };
  assertEquals(shouldEnrich(corruptedWineryWithZero), true);
});


