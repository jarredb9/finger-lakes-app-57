import { assertEquals } from "std/testing/asserts.ts"
import { stub, Stub } from "std/testing/mock.ts"
import { handler } from "./index.ts"
import { mockDenoEnv } from "../_shared/testing-helpers.ts"

// Custom fetch mock to support both Supabase and Gemini URLs
function mockFetchForGemini(
  geminiResponse: any,
  supabaseResponses: any[]
): Stub {
  let supabaseCallCount = 0
  let geminiCallCount = 0

  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        geminiCallCount++
        return Promise.resolve(
          new Response(JSON.stringify(geminiResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      }
      if (urlStr.includes(".supabase.co")) {
        const response = supabaseResponses[supabaseCallCount]
        supabaseCallCount++
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      }
      return Promise.reject(new Error(`Unhandled fetch to ${urlStr}`))
    }
  )
}

Deno.test("update-gemini-summary - successful early return when cache is fresh", async () => {
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: "test-gemini-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  // Date 5 days ago to ensure cache is fresh
  const freshDate = new Date()
  freshDate.setDate(freshDate.getDate() - 5)

  const mockWinery = {
    id: 1,
    name: "Fresh Winery",
    address: "123 Wine Lane",
    generative_summary: { overview: { text: "Fresh cache summary" } },
    last_enriched_at: freshDate.toISOString(),
  }

  // Only 1 Supabase call expected to select the winery. No Gemini, no visits query.
  const fetchStub = mockFetchForGemini(null, [mockWinery])

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ record: { winery_id: 1 } }),
    })

    const res = await handler(req)
    const data = await res.json()

    assertEquals(res.status, 200)
    assertEquals(data.success, true)
    assertEquals(data.message, "Cache is fresh")
    assertEquals(data.generative_summary.overview.text, "Fresh cache summary")
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("update-gemini-summary - successful summary update when cache is stale", async () => {
  const envStub = mockDenoEnv({
    GEMINI_API_KEY: "test-gemini-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  // Date 35 days ago to ensure cache is stale
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - 35)

  const mockWinery = {
    id: 2,
    name: "Stale Winery",
    address: "456 Vineyard Rd",
    generative_summary: { overview: { text: "Stale summary" } },
    last_enriched_at: staleDate.toISOString(),
  }

  const mockVisits = [
    { user_review: "Great Pinot Noir!" },
    { user_review: "Lovely tasting room." },
  ]

  const mockGeminiResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "A highly rated winery featuring great Pinot Noir and a lovely tasting room.",
            },
          ],
        },
      },
    ],
  }

  // Supabase responses sequence:
  // 1. Fetch Winery
  // 2. Fetch Visits (Reviews)
  // 3. Update Winery
  const fetchStub = mockFetchForGemini(mockGeminiResponse, [
    mockWinery,
    mockVisits,
    { success: true }, // Update response
  ])

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ record: { winery_id: 2 } }),
    })

    const res = await handler(req)
    const data = await res.json()

    assertEquals(res.status, 200)
    assertEquals(data.success, true)
    assertEquals(data.message, "Summary updated successfully")
    assertEquals(
      data.generative_summary.overview.text,
      "A highly rated winery featuring great Pinot Noir and a lovely tasting room."
    )
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("update-gemini-summary - error handling missing api key", async () => {
  const envStub = mockDenoEnv({})

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      body: JSON.stringify({ record: { winery_id: 3 } }),
    })

    const res = await handler(req)
    const data = await res.json()

    assertEquals(res.status, 400)
    assertEquals(data.error, "Missing GEMINI_API_KEY or GOOGLE_MAPS_API_KEY")
  } finally {
    envStub.restore()
  }
})

Deno.test("update-gemini-summary - OPTIONS preflight checks", async () => {
  const req = new Request("https://test.com", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type, x-skip-sw-interception"
    }
  })

  const res = await handler(req)
  assertEquals(res.status, 200)
  const allowHeaders = res.headers.get("Access-Control-Allow-Headers") || ""
  assertEquals(allowHeaders.toLowerCase().includes("x-skip-sw-interception"), true)
})
