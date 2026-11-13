import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyBearerSecret } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-skip-sw-interception",
};

interface WebhookPayload {
  record?: {
    id?: unknown;
    user_id?: unknown;
    privacy_level?: unknown;
  };
}

export interface ActivityLedgerRecord {
  id: string;
  user_id: string;
  privacy_level: "public" | "friends_only" | "private" | string;
}

export interface SocialNotificationResponse {
  success: true;
  count: number;
  message?: string;
}

export interface SocialErrorResponse {
  error: string;
}

function jsonResponse(
  body: SocialNotificationResponse | SocialErrorResponse,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const isAuthorized = await verifyBearerSecret(authHeader, [
    Deno.env.get("INTERNAL_WEBHOOK_SECRET"),
    Deno.env.get("WEBHOOK_SECRET"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ]);

  if (!isAuthorized) {
    return jsonResponse(
      { error: "Unauthorized: Missing or invalid authorization token" },
      401,
    );
  }

  try {
    let payload: WebhookPayload;
    try {
      payload = await req.json();
    } catch (_e) {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }

    const record = payload?.record;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return jsonResponse({ error: "Missing record in payload" }, 400);
    }

    const activityId = typeof record.id === "string" ? record.id.trim() : "";
    if (!activityId) {
      return jsonResponse({ error: "Missing id in record" }, 400);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: ledgerRow, error: ledgerError } = await supabaseClient
      .from("activity_ledger")
      .select("id, user_id, privacy_level")
      .eq("id", activityId)
      .maybeSingle();

    if (ledgerError) {
      return jsonResponse(
        { error: `Failed to verify activity: ${ledgerError.message}` },
        500,
      );
    }

    const ledgerActivity = ledgerRow as ActivityLedgerRecord | null;
    if (!ledgerActivity) {
      return jsonResponse({ error: "Activity not found" }, 404);
    }

    if (
      record.user_id !== undefined &&
      record.user_id !== null &&
      record.user_id !== ledgerActivity.user_id
    ) {
      return jsonResponse(
        { error: "Payload user_id does not match activity_ledger owner" },
        400,
      );
    }

    const actorId = ledgerActivity.user_id;
    const activityPrivacy = ledgerActivity.privacy_level;

    if (!actorId) {
      return jsonResponse({ error: "Malformed activity_ledger record" }, 500);
    }

    // Enforce authoritative activity privacy before querying social graph tables.
    if (activityPrivacy === "private") {
      return jsonResponse({
        success: true,
        count: 0,
        message: "Activity is private, no notifications sent.",
      });
    }

    // Fetch the actor's profile from public.profiles by ID to check their privacy_level.
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("privacy_level")
      .eq("id", actorId)
      .single();

    if (profileError) {
      return jsonResponse(
        { error: `Profile not found: ${profileError.message}` },
        400,
      );
    }

    if (profile?.privacy_level === "private") {
      return jsonResponse({
        success: true,
        count: 0,
        message: "Profile is private, no notifications sent.",
      });
    }

    // Query public.follows to find followers: follower_id where following_id = actorId.
    const { data: followers, error: followersError } = await supabaseClient
      .from("follows")
      .select("follower_id")
      .eq("following_id", actorId);

    if (followersError) {
      throw followersError;
    }

    // Query public.friends to find accepted mutual friends.
    const [friends1Res, friends2Res] = await Promise.all([
      supabaseClient
        .from("friends")
        .select("user2_id")
        .eq("user1_id", actorId)
        .eq("status", "accepted"),
      supabaseClient
        .from("friends")
        .select("user1_id")
        .eq("user2_id", actorId)
        .eq("status", "accepted"),
    ]);

    if (friends1Res.error) throw friends1Res.error;
    if (friends2Res.error) throw friends2Res.error;

    const recipientSet = new Set<string>();

    if (followers) {
      for (const f of followers) {
        if (f.follower_id && f.follower_id !== actorId) {
          recipientSet.add(f.follower_id);
        }
      }
    }

    if (friends1Res.data) {
      for (const f of friends1Res.data) {
        if (f.user2_id && f.user2_id !== actorId) {
          recipientSet.add(f.user2_id);
        }
      }
    }
    if (friends2Res.data) {
      for (const f of friends2Res.data) {
        if (f.user1_id && f.user1_id !== actorId) {
          recipientSet.add(f.user1_id);
        }
      }
    }

    const recipientIds = Array.from(recipientSet);

    for (const recipientId of recipientIds) {
      console.log(
        `[Notification] Sent notification to user ${recipientId} for activity ${activityId}`,
      );
    }

    return jsonResponse({ success: true, count: recipientIds.length });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return jsonResponse({ error: error.message }, 400);
  }
};

if (import.meta.main) {
  Deno.serve(handler);
}
