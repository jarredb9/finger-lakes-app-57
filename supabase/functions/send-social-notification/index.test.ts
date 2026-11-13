import { assertEquals } from "std/testing/asserts.ts"
import { stub, Stub } from "std/testing/mock.ts"
import { handler } from "./index.ts"
import { mockDenoEnv } from "../_shared/testing-helpers.ts"

export interface ActivityLedgerRecord {
  id: string
  user_id: string
  privacy_level: "public" | "friends_only" | "private" | string
}

interface SocialMockResponses {
  activityLedger?: ActivityLedgerRecord | null
  activityLedgerError?: { status?: number; message?: string }
  profile?: { privacy_level?: string } | null
  follows?: Array<{ follower_id: string }>
  friends1?: Array<{ user2_id: string }>
  friends2?: Array<{ user1_id: string }>
}

function mockFetchForSocial(responses: SocialMockResponses): Stub {
  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes(".supabase.co")) {
        if (urlStr.includes("/rest/v1/activity_ledger")) {
          if (responses.activityLedgerError) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  message: responses.activityLedgerError.message ?? "Database error",
                }),
                {
                  status: responses.activityLedgerError.status ?? 500,
                  headers: { "Content-Type": "application/json" },
                }
              )
            )
          }
          return Promise.resolve(
            new Response(JSON.stringify(responses.activityLedger ?? null), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        }
        if (urlStr.includes("/rest/v1/profiles")) {
          return Promise.resolve(
            new Response(
              JSON.stringify(responses.profile !== undefined ? responses.profile : {}),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            )
          )
        }
        if (urlStr.includes("/rest/v1/follows")) {
          return Promise.resolve(
            new Response(JSON.stringify(responses.follows ?? []), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        }
        if (urlStr.includes("/rest/v1/friends")) {
          const isUser1Query = urlStr.includes("user1_id=eq.")
          const responseData = isUser1Query
            ? (responses.friends1 ?? [])
            : (responses.friends2 ?? [])
          return Promise.resolve(
            new Response(JSON.stringify(responseData), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        }
      }
      return Promise.reject(new Error(`Unhandled fetch to ${urlStr}`))
    }
  )
}

Deno.test("send-social-notification - OPTIONS preflight checks", async () => {
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

Deno.test("send-social-notification - skips when activity is private", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "private",
    },
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "private"
        }
      }),
    })

    const res = await handler(req)
    const data = await res.json()

    assertEquals(res.status, 200)
    assertEquals(data.success, true)
    assertEquals(data.count, 0)
    assertEquals("notified" in data, false)
    assertEquals(data.notified, undefined)
    assertEquals(data.message, "Activity is private, no notifications sent.")
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - skips when profile is private", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "public",
    },
    profile: { privacy_level: "private" }
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "public"
        }
      }),
    })

    const res = await handler(req)
    const data = await res.json()

    assertEquals(res.status, 200)
    assertEquals(data.success, true)
    assertEquals(data.count, 0)
    assertEquals("notified" in data, false)
    assertEquals(data.notified, undefined)
    assertEquals(data.message, "Profile is private, no notifications sent.")
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - successfully sends notifications to unique followers and friends", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "actor-user-id",
      privacy_level: "friends_only",
    },
    profile: { privacy_level: "public" },
    follows: [
      { follower_id: "follower-1" },
      { follower_id: "duplicate-user" }
    ],
    friends1: [
      { user2_id: "friend-1" },
      { user2_id: "duplicate-user" }
    ],
    friends2: [
      { user1_id: "friend-2" }
    ]
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "actor-user-id",
          privacy_level: "friends_only"
        }
      }),
    })

    const res = await handler(req)
    const data = await res.json()
    const serialized = JSON.stringify(data)

    assertEquals(res.status, 200)
    assertEquals(data.success, true)

    // Expect count of unique recipients (follower-1, duplicate-user, friend-1, friend-2) = 4,
    // with zero recipient or actor IDs disclosed in the response payload.
    assertEquals(data.count, 4)
    assertEquals("notified" in data, false)
    assertEquals(data.notified, undefined)
    assertEquals(serialized.includes("follower-1"), false)
    assertEquals(serialized.includes("duplicate-user"), false)
    assertEquals(serialized.includes("friend-1"), false)
    assertEquals(serialized.includes("friend-2"), false)
    assertEquals(serialized.includes("actor-user-id"), false)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - returns 400 when record.id is missing and issues zero fetch calls", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({})

  try {
    const invalidPayloads = [
      {},
      { record: {} },
      { record: { id: "" } },
      { record: { user_id: "user-1", privacy_level: "public" } },
    ]

    for (const payload of invalidPayloads) {
      const req = new Request("https://test.com", {
        method: "POST",
        headers: { Authorization: "Bearer test-role-key" },
        body: JSON.stringify(payload),
      })

      const res = await handler(req)
      assertEquals(res.status, 400)
    }

    assertEquals(fetchStub.calls.length, 0)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - returns 404 when activity_ledger row is missing without querying downstream tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: null,
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "non-existent-activity",
          user_id: "user-1",
          privacy_level: "public",
        },
      }),
    })

    const res = await handler(req)
    assertEquals(res.status, 404)

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString())
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/activity_ledger")), true)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles")), false)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows")), false)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/friends")), false)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - fails closed on unexpected activity_ledger DB error without querying downstream tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedgerError: { status: 500, message: "Internal ledger query failure" },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "public",
        },
      }),
    })

    const res = await handler(req)
    assertEquals(res.status >= 400, true)

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString())
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/activity_ledger")), true)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles")), false)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows")), false)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/friends")), false)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - returns 400 on record.user_id mismatch without querying downstream tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "authoritative-user-id",
      privacy_level: "public",
    },
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "spoofed-user-id",
          privacy_level: "public",
        },
      }),
    })

    const res = await handler(req)
    assertEquals(res.status, 400)

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString())
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/activity_ledger")), true)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles")), false)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows")), false)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/friends")), false)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - resolves authoritative user_id and privacy_level from minimal { record: { id } } payload", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "authoritative-actor-id",
      privacy_level: "public",
    },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
    friends1: [{ user2_id: "friend-1" }],
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
        },
      }),
    })

    const res = await handler(req)
    const data = await res.json()

    assertEquals(res.status, 200)
    assertEquals(data.success, true)
    assertEquals(data.count, 2)
    assertEquals("notified" in data, false)

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString())
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles") && u.includes("authoritative-actor-id")), true)
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows") && u.includes("authoritative-actor-id")), true)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})

Deno.test("send-social-notification - accepts WEBHOOK_SECRET and INTERNAL_WEBHOOK_SECRET Bearer tokens", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
    WEBHOOK_SECRET: "webhook-secret-token",
    INTERNAL_WEBHOOK_SECRET: "internal-webhook-token",
  })

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "public",
    },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
  })

  try {
    for (const secret of ["webhook-secret-token", "internal-webhook-token"]) {
      const req = new Request("https://test.com", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          record: { id: "activity-1" },
        }),
      })

      const res = await handler(req)
      const data = await res.json()

      assertEquals(res.status, 200)
      assertEquals(data.success, true)
      assertEquals(data.count, 1)
      assertEquals("notified" in data, false)
    }
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})
