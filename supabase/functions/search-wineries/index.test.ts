import { assertEquals } from "std/testing/asserts.ts";
import { handler } from "./index.ts";
import { mockDenoEnv, mockFetch } from "../_shared/testing-helpers.ts";

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
