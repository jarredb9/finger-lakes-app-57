import { assertEquals } from "std/testing/asserts.ts";
import { stub, Stub } from "std/testing/mock.ts";
import { handler } from "./index.ts";
import { mockDenoEnv } from "../_shared/testing-helpers.ts";

export interface ActivityLedgerRecord {
  id: string;
  user_id: string;
  privacy_level: "public" | "friends_only" | "private" | string;
}

interface MockDbError {
  status?: number;
  message?: string;
  code?: string;
}

interface SocialMockResponses {
  activityLedger?: ActivityLedgerRecord | null;
  activityLedgerError?: MockDbError;
  profile?: { privacy_level?: string } | null;
  profileError?: MockDbError;
  follows?: Array<{ follower_id: string }>;
  followsError?: MockDbError;
  friends1?: Array<{ user2_id: string }>;
  friends1Error?: MockDbError;
  friends2?: Array<{ user1_id: string }>;
  friends2Error?: MockDbError;
}

function errorResponse(err: MockDbError): Response {
  return new Response(
    JSON.stringify({
      message: err.message ?? "Database error",
      code: err.code ?? "PGRST000",
    }),
    {
      status: err.status ?? 500,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function mockFetchForSocial(responses: SocialMockResponses): Stub {
  return stub(
    globalThis,
    "fetch",
    (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes(".supabase.co")) {
        if (urlStr.includes("/rest/v1/activity_ledger")) {
          if (responses.activityLedgerError) {
            return Promise.resolve(errorResponse(responses.activityLedgerError));
          }
          return Promise.resolve(
            new Response(JSON.stringify(responses.activityLedger ?? null), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (urlStr.includes("/rest/v1/profiles")) {
          if (responses.profileError) {
            return Promise.resolve(errorResponse(responses.profileError));
          }
          return Promise.resolve(
            new Response(
              JSON.stringify(responses.profile !== undefined ? responses.profile : {}),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        if (urlStr.includes("/rest/v1/follows")) {
          if (responses.followsError) {
            return Promise.resolve(errorResponse(responses.followsError));
          }
          return Promise.resolve(
            new Response(JSON.stringify(responses.follows ?? []), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (urlStr.includes("/rest/v1/friends")) {
          const isUser1Query = urlStr.includes("user1_id=eq.");
          const friendError = isUser1Query ? responses.friends1Error : responses.friends2Error;
          if (friendError) {
            return Promise.resolve(errorResponse(friendError));
          }
          const responseData = isUser1Query
            ? (responses.friends1 ?? [])
            : (responses.friends2 ?? []);
          return Promise.resolve(
            new Response(JSON.stringify(responseData), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
      }
      return Promise.reject(new Error(`Unhandled fetch to ${urlStr}`));
    },
  );
}

Deno.test("send-social-notification - OPTIONS preflight checks", async () => {
  const req = new Request("https://test.com", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type, x-skip-sw-interception",
    },
  });

  const res = await handler(req);
  assertEquals(res.status, 200);
  const allowHeaders = res.headers.get("Access-Control-Allow-Headers") || "";
  assertEquals(allowHeaders.toLowerCase().includes("x-skip-sw-interception"), true);
});

Deno.test("send-social-notification - skips when activity is private", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "private",
    },
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "user-1",
          privacy_level: "private",
        },
      }),
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.count, 0);
    assertEquals("notified" in data, false);
    assertEquals(data.notified, undefined);
    assertEquals(data.message, "Activity is private, no notifications sent.");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - skips when profile is private", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "public",
    },
    profile: { privacy_level: "private" },
  });

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
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.count, 0);
    assertEquals("notified" in data, false);
    assertEquals(data.notified, undefined);
    assertEquals(data.message, "Profile is private, no notifications sent.");
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - successfully sends notifications to unique followers and friends", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "actor-user-id",
      privacy_level: "friends_only",
    },
    profile: { privacy_level: "public" },
    follows: [
      { follower_id: "follower-1" },
      { follower_id: "duplicate-user" },
      { follower_id: "actor-user-id" },
    ],
    friends1: [
      { user2_id: "friend-1" },
      { user2_id: "duplicate-user" },
      { user2_id: "actor-user-id" },
    ],
    friends2: [
      { user1_id: "friend-2" },
      { user1_id: "actor-user-id" },
    ],
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
          user_id: "actor-user-id",
          privacy_level: "friends_only",
        },
      }),
    });

    const res = await handler(req);
    const data = await res.json();
    const serialized = JSON.stringify(data);

    assertEquals(res.status, 200);
    assertEquals(data.success, true);

    // Expect count of unique recipients (follower-1, duplicate-user, friend-1, friend-2) = 4,
    // excluding actor-user-id and omitting all recipient/actor IDs from the response payload.
    assertEquals(data.count, 4);
    assertEquals("notified" in data, false);
    assertEquals(data.notified, undefined);
    assertEquals(serialized.includes("follower-1"), false);
    assertEquals(serialized.includes("duplicate-user"), false);
    assertEquals(serialized.includes("friend-1"), false);
    assertEquals(serialized.includes("friend-2"), false);
    assertEquals(serialized.includes("actor-user-id"), false);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - returns 400 on invalid JSON or missing/invalid record.id and issues zero fetch calls", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({});

  try {
    const malformedReq = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: "{not-valid-json",
    });
    const malformedRes = await handler(malformedReq);
    assertEquals(malformedRes.status, 400);

    const invalidPayloads: unknown[] = [
      {},
      { record: null },
      { record: [] },
      { record: {} },
      { record: { id: "" } },
      { record: { id: "   " } },
      { record: { id: 123 } },
      { record: { user_id: "user-1", privacy_level: "public" } },
    ];

    for (const payload of invalidPayloads) {
      const req = new Request("https://test.com", {
        method: "POST",
        headers: { Authorization: "Bearer test-role-key" },
        body: JSON.stringify(payload),
      });

      const res = await handler(req);
      assertEquals(res.status, 400);
    }

    assertEquals(fetchStub.calls.length, 0);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - returns 404 when activity_ledger row is missing without querying downstream tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: null,
  });

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
    });

    const res = await handler(req);
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

Deno.test("send-social-notification - fails closed on unexpected activity_ledger DB error without querying downstream tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedgerError: { status: 500, message: "Internal ledger query failure" },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
  });

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
    });

    const res = await handler(req);
    assertEquals(res.status, 500);

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

Deno.test("send-social-notification - maps invalid UUID syntax (22P02) on activity_ledger to 400", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedgerError: {
      status: 400,
      code: "22P02",
      message: 'invalid input syntax for type uuid: "not-a-uuid"',
    },
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: { id: "not-a-uuid" },
      }),
    });

    const res = await handler(req);
    assertEquals(res.status, 400);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - returns 500 when Supabase server configuration is missing", async () => {
  const envStub = mockDenoEnv({
    WEBHOOK_SECRET: "webhook-secret-token",
  });

  const fetchStub = mockFetchForSocial({});

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer webhook-secret-token" },
      body: JSON.stringify({
        record: { id: "activity-1" },
      }),
    });

    const res = await handler(req);
    const data = await res.json();
    assertEquals(res.status, 500);
    assertEquals(data.error, "Server configuration error");
    assertEquals(fetchStub.calls.length, 0);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - returns 500 with error message when follows or friends queries fail", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const ledgerRow: ActivityLedgerRecord = {
    id: "activity-1",
    user_id: "user-1",
    privacy_level: "public",
  };

  const followsFailStub = mockFetchForSocial({
    activityLedger: ledgerRow,
    profile: { privacy_level: "public" },
    followsError: { status: 500, message: "follows query timed out" },
  });

  try {
    const res = await handler(
      new Request("https://test.com", {
        method: "POST",
        headers: { Authorization: "Bearer test-role-key" },
        body: JSON.stringify({ record: { id: "activity-1" } }),
      }),
    );
    const data = await res.json();
    assertEquals(res.status, 500);
    assertEquals(data.error, "Failed to fetch followers: follows query timed out");
  } finally {
    followsFailStub.restore();
  }

  const friendsFailStub = mockFetchForSocial({
    activityLedger: ledgerRow,
    profile: { privacy_level: "public" },
    follows: [],
    friends1Error: { status: 500, message: "friends query unavailable" },
  });

  try {
    const res = await handler(
      new Request("https://test.com", {
        method: "POST",
        headers: { Authorization: "Bearer test-role-key" },
        body: JSON.stringify({ record: { id: "activity-1" } }),
      }),
    );
    const data = await res.json();
    assertEquals(res.status, 500);
    assertEquals(data.error, "Failed to fetch friends: friends query unavailable");
  } finally {
    envStub.restore();
    friendsFailStub.restore();
  }
});

Deno.test("send-social-notification - returns 400 when profile lookup fails", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "public",
    },
    profileError: { status: 406, message: "JSON object requested, multiple (or no) rows returned" },
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({ record: { id: "activity-1" } }),
    });

    const res = await handler(req);
    const data = await res.json();
    assertEquals(res.status, 400);
    assertEquals(typeof data.error === "string" && data.error.includes("Profile not found:"), true);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - returns 400 on record.user_id mismatch without querying downstream tables", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "authoritative-user-id",
      privacy_level: "public",
    },
  });

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
    });

    const res = await handler(req);
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

Deno.test("send-social-notification - resolves authoritative user_id and privacy_level from minimal { record: { id } } payload", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "authoritative-actor-id",
      privacy_level: "public",
    },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
    friends1: [{ user2_id: "friend-1" }],
  });

  try {
    const req = new Request("https://test.com", {
      method: "POST",
      headers: { Authorization: "Bearer test-role-key" },
      body: JSON.stringify({
        record: {
          id: "activity-1",
        },
      }),
    });

    const res = await handler(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.count, 2);
    assertEquals("notified" in data, false);

    const calledUrls = fetchStub.calls.map((c) => c.args[0].toString());
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/profiles") && u.includes("authoritative-actor-id")), true);
    assertEquals(calledUrls.some((u) => u.includes("/rest/v1/follows") && u.includes("authoritative-actor-id")), true);
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});

Deno.test("send-social-notification - accepts WEBHOOK_SECRET and INTERNAL_WEBHOOK_SECRET Bearer tokens", async () => {
  const envStub = mockDenoEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-role-key",
    WEBHOOK_SECRET: "webhook-secret-token",
    INTERNAL_WEBHOOK_SECRET: "internal-webhook-token",
  });

  const fetchStub = mockFetchForSocial({
    activityLedger: {
      id: "activity-1",
      user_id: "user-1",
      privacy_level: "public",
    },
    profile: { privacy_level: "public" },
    follows: [{ follower_id: "follower-1" }],
  });

  try {
    for (const secret of ["webhook-secret-token", "internal-webhook-token"]) {
      const req = new Request("https://test.com", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          record: { id: "activity-1" },
        }),
      });

      const res = await handler(req);
      const data = await res.json();

      assertEquals(res.status, 200);
      assertEquals(data.success, true);
      assertEquals(data.count, 1);
      assertEquals("notified" in data, false);
    }
  } finally {
    envStub.restore();
    fetchStub.restore();
  }
});
