import { assertEquals } from "std/testing/asserts.ts"
import { stub, Stub } from "std/testing/mock.ts"
import { handler } from "./index.ts"
import { mockDenoEnv } from "../_shared/testing-helpers.ts"

function mockFetchForSocial(
  responses: {
    profile?: any
    follows?: any
    friends1?: any
    friends2?: any
  }
): Stub {
  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes(".supabase.co")) {
        if (urlStr.includes("/rest/v1/profiles")) {
          return Promise.resolve(
            new Response(JSON.stringify(responses.profile || {}), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        }
        if (urlStr.includes("/rest/v1/follows")) {
          return Promise.resolve(
            new Response(JSON.stringify(responses.follows || []), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        }
        if (urlStr.includes("/rest/v1/friends")) {
          const isUser1Query = urlStr.includes("user1_id=eq.")
          const responseData = isUser1Query
            ? (responses.friends1 || [])
            : (responses.friends2 || [])
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

  try {
    const req = new Request("https://test.com", {
      method: "POST",
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
    assertEquals(data.notified.length, 0)
    assertEquals(data.message, "Activity is private, no notifications sent.")
  } finally {
    envStub.restore()
  }
})

Deno.test("send-social-notification - skips when profile is private", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  })

  const fetchStub = mockFetchForSocial({
    profile: { privacy_level: "private" }
  })

  try {
    const req = new Request("https://test.com", {
      method: "POST",
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
    assertEquals(data.notified.length, 0)
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

    assertEquals(res.status, 200)
    assertEquals(data.success, true)
    
    // Expect unique sorted/unsorted set of: follower-1, duplicate-user, friend-1, friend-2
    // That's 4 distinct users.
    assertEquals(data.notified.length, 4)
    assertEquals(data.notified.includes("follower-1"), true)
    assertEquals(data.notified.includes("duplicate-user"), true)
    assertEquals(data.notified.includes("friend-1"), true)
    assertEquals(data.notified.includes("friend-2"), true)
  } finally {
    envStub.restore()
    fetchStub.restore()
  }
})
