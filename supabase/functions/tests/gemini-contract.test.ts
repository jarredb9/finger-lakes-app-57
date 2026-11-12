import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import { stub } from "jsr:@std/testing/mock";
import { generateGeminiSummary } from "../_shared/gemini.ts";
import { mockDenoEnv, mockFetch, VALID_GEMINI_MODELS } from "../_shared/testing-helpers.ts";

Deno.test("gemini-contract - AQ. API key sends x-goog-api-key header and no Bearer token", async () => {
  const aqKey = "AQ.test_mock_gemini_api_key_format_123456789";
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: aqKey,
  });

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: "AQ Key Test Summary",
                        vibe_tags: ["Scenic"],
                        varietals: [{ name: "Riesling" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
  );

  try {
    const result = await generateGeminiSummary("Test Winery", "123 Main St");
    
    // URL should NOT leak API key in query parameters
    assertEquals(capturedUrl.includes("?key="), false, "API key should not be passed in URL query param");
    
    // Must pass x-goog-api-key
    assertEquals(capturedHeaders["x-goog-api-key"], aqKey, "Must pass x-goog-api-key header");
    
    // Must NOT pass Authorization Bearer header
    assertEquals(capturedHeaders["Authorization"], undefined, "Must not pass Authorization header for API keys");
    
    // Result verification
    assertEquals(result.generative_summary?.overview?.text, "AQ Key Test Summary");
    assertEquals(result.is_fallback, undefined);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("gemini-contract - AIzaSy API key sends x-goog-api-key header and no Bearer token", async () => {
  const aizaKey = "AIzaSyDtRMuqE7KeLC_e9GbmAxfDFc6G48ZKOQ0";
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: aizaKey,
  });

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: "AIzaSy Key Test Summary",
                        vibe_tags: ["Historic"],
                        varietals: [{ name: "Chardonnay" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
  );

  try {
    const result = await generateGeminiSummary("Test Winery", "123 Main St");
    
    assertEquals(capturedUrl.includes("?key="), false, "API key should not be passed in URL query param");
    assertEquals(capturedHeaders["x-goog-api-key"], aizaKey, "Must pass x-goog-api-key header");
    assertEquals(capturedHeaders["Authorization"], undefined, "Must not pass Authorization header for API keys");
    assertEquals(result.generative_summary?.overview?.text, "AIzaSy Key Test Summary");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("gemini-contract - OAuth ya29. token sends Authorization: Bearer and no ?key=", async () => {
  const oauthToken = "ya29.a0AfH6SMB_sample_access_token_mock";
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: oauthToken,
  });

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: "OAuth Test Summary",
                        vibe_tags: ["Tasting"],
                        varietals: [{ name: "Cabernet Franc" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
  );

  try {
    const result = await generateGeminiSummary("Test Winery", "123 Main St");
    
    assertEquals(capturedUrl.includes("?key="), false, "Token should not be passed in URL query param");
    assertEquals(capturedHeaders["Authorization"], `Bearer ${oauthToken}`, "Must pass Authorization Bearer header for OAuth token");
    assertEquals(capturedHeaders["x-goog-api-key"], undefined, "Must not pass x-goog-api-key for OAuth tokens");
    assertEquals(result.generative_summary?.overview?.text, "OAuth Test Summary");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("gemini-contract - model priority list uses valid active 2026 models and handles fallback progression", async () => {
  const aqKey = "AQ.test_mock_gemini_api_key_format_123456789";
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: aqKey,
  });

  const attemptedModels: string[] = [];

  const fetchStub = stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      const match = urlStr.match(/\/models\/([^:?]+):generateContent/);
      const model = match ? match[1] : "unknown";
      attemptedModels.push(model);

      // Simulate first model failing with 500, second succeeding with 200
      if (attemptedModels.length === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 500, message: "Internal error" } }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: "Fallback model succeeded",
                        vibe_tags: ["Lake View"],
                        varietals: [{ name: "Dry Riesling" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
  );

  try {
    const result = await generateGeminiSummary("Test Winery", "123 Main St");

    // All attempted models must be in VALID_GEMINI_MODELS
    for (const model of attemptedModels) {
      assertEquals(
        VALID_GEMINI_MODELS.includes(model),
        true,
        `Attempted model "${model}" is not in VALID_GEMINI_MODELS`
      );
    }

    // Must have tried at least 2 models
    assertEquals(attemptedModels.length, 2);
    assertEquals(result.generative_summary?.overview?.text, "Fallback model succeeded");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("gemini-contract - returns fallback indicator when all models fail", async () => {
  const aqKey = "AQ.test_mock_gemini_api_key_format_123456789";
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: aqKey,
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 500, message: "Service unavailable" } }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      );
    }
  );

  try {
    const result = await generateGeminiSummary("Test Winery", "123 Main St");

    assertEquals(result.is_fallback, true);
    assertNotEquals(result.error, undefined);
    assertNotEquals(result.generative_summary, null);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});
