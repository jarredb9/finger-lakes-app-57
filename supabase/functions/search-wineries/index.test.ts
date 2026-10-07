import { assertEquals } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import { handler } from "./index.ts";
import { mockDenoEnv, mockFetch } from "../_shared/testing-helpers.ts";
import { normalizeGooglePlaceV1 } from "../_shared/normalization.ts";

Deno.test("search-wineries handler - successful search", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const googlePlace = {
    id: "ChIJtest",
    displayName: { text: "Test Winery" },
    formattedAddress: "123 Test St",
    location: { latitude: 42.1, longitude: -76.1 },
    types: ["winery"],
    photos: [
      { name: "places/ChIJtest/photos/photo_123" }
    ],
  };

  const googleResponse = {
    places: [googlePlace],
  };

  // search-wineries does one RPC call in the background
  const fetchStub = mockFetch(googleResponse, null);

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ query: "test winery" }),
    });

    const res = await handler(req);
    const data = await res.json();

    if (res.status !== 200) {
      console.log("Error response data:", data);
    }

    assertEquals(res.status, 200);
    assertEquals(data.length, 1);
    assertEquals(data[0].name, "Test Winery");
    assertEquals(data[0].enrichment_tier, "basic");
    assertEquals(data[0].primary_photo_reference, "places/ChIJtest/photos/photo_123");
    assertEquals(data[0].photo_references, ["places/ChIJtest/photos/photo_123"]);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("search-wineries handler - missing API key", async () => {
  const envStub = mockDenoEnv({});

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ query: "test winery" }),
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 400);
    assertEquals(data.error, "Missing GOOGLE_MAPS_API_KEY");
  } finally {
    envStub.restore();
  }
});

Deno.test("search-wineries handler - OPTIONS preflight checks", async () => {
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

Deno.test("search-wineries handler - requests places.rating and places.userRatingCount in essentials field mask and ingests them", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  let capturedFieldMask: string | null = null;
  const googlePlace = {
    id: "ChIJtest_rating",
    displayName: { text: "Seneca Lake Cellars" },
    formattedAddress: "456 Vineyard Way",
    location: { latitude: 42.5, longitude: -76.9 },
    types: ["winery"],
    rating: 4.8,
    userRatingCount: 245,
    photos: [{ name: "places/ChIJtest_rating/photos/photo_456" }],
  };

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("places.googleapis.com")) {
        const headers = init?.headers as Record<string, string> | undefined;
        capturedFieldMask = headers ? (headers["X-Goog-FieldMask"] || null) : null;
        return Promise.resolve(
          new Response(JSON.stringify({ places: [googlePlace] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (urlStr.includes(".supabase.co")) {
        return Promise.resolve(
          new Response(JSON.stringify(null), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.reject(new Error(`Unhandled fetch to ${urlStr}`));
    }
  );

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ query: "Seneca Lake Cellars" }),
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.length, 1);

    // Verify field mask requested essentials rating fields
    const mask = capturedFieldMask as string | null;
    assertEquals(mask?.includes("places.rating"), true);
    assertEquals(mask?.includes("places.userRatingCount"), true);

    // Verify response normalization maps ratings and review counts in both formats
    assertEquals(data[0].google_rating, 4.8);
    assertEquals(data[0].rating, 4.8);
    assertEquals(data[0].user_rating_count, 245);
    assertEquals(data[0].userRatingCount, 245);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("search-wineries handler - normalizes unrated or zero ratings to null", async () => {
  const envStub = mockDenoEnv({
    GOOGLE_MAPS_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const googlePlace = {
    id: "ChIJunrated",
    displayName: { text: "Unrated Winery" },
    formattedAddress: "789 Vineyard Way",
    location: { latitude: 42.6, longitude: -76.8 },
    types: ["winery"],
    rating: 0,
    userRatingCount: 0,
  };

  const fetchStub = mockFetch({ places: [googlePlace] }, null);

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ query: "Unrated Winery" }),
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.length, 1);
    assertEquals(data[0].google_rating, null);
    assertEquals(data[0].rating, null);
    assertEquals(data[0].user_rating_count, null);
    assertEquals(data[0].userRatingCount, null);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("normalizeGooglePlaceV1 - maps rating and userRatingCount correctly for basic tier", () => {
  const place = {
    id: "ChIJtest_basic",
    displayName: { text: "Basic Winery" },
    formattedAddress: "101 Keuka Way",
    location: { latitude: 42.4, longitude: -77.1 },
    rating: 4.3,
    userRatingCount: 88,
  };

  const normalized = normalizeGooglePlaceV1(place, "basic");
  assertEquals(normalized.enrichment_tier, "basic");
  assertEquals(normalized.google_rating, 4.3);
  assertEquals(normalized.user_rating_count, 88);
});

