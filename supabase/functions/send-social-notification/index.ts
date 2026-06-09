import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-skip-sw-interception',
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let payload: any
    try {
      payload = await req.json()
    } catch (_e) {
      throw new Error('Invalid JSON payload')
    }

    const record = payload?.record
    if (!record) {
      throw new Error('Missing record in payload')
    }

    const actorId = record.user_id
    const activityPrivacy = record.privacy_level
    const activityId = record.id

    if (!actorId) {
      throw new Error('Missing user_id in record')
    }

    // If the activity's privacy_level is 'private', return 200 with a message stating that the activity is private and no notifications were sent.
    if (activityPrivacy === 'private') {
      return new Response(
        JSON.stringify({ success: true, notified: [], message: 'Activity is private, no notifications sent.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Using the Supabase Deno client, fetch the actor's profile from public.profiles by ID to check their privacy_level.
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('privacy_level')
      .eq('id', actorId)
      .single()

    if (profileError) {
      throw new Error(`Profile not found: ${profileError.message}`)
    }

    // If the actor's profile privacy_level is 'private', return 200 with a message stating that the profile is private and no notifications were sent.
    if (profile?.privacy_level === 'private') {
      return new Response(
        JSON.stringify({ success: true, notified: [], message: 'Profile is private, no notifications sent.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Query public.follows to find followers: follower_id where following_id = actor_id.
    const { data: followers, error: followersError } = await supabaseClient
      .from('follows')
      .select('follower_id')
      .eq('following_id', actorId)

    if (followersError) {
      throw followersError
    }

    // Query public.friends to find accepted mutual friends:
    // user2_id where user1_id = actor_id AND status = 'accepted'
    // user1_id where user2_id = actor_id AND status = 'accepted'
    const [friends1Res, friends2Res] = await Promise.all([
      supabaseClient
        .from('friends')
        .select('user2_id')
        .eq('user1_id', actorId)
        .eq('status', 'accepted'),
      supabaseClient
        .from('friends')
        .select('user1_id')
        .eq('user2_id', actorId)
        .eq('status', 'accepted')
    ])

    if (friends1Res.error) throw friends1Res.error
    if (friends2Res.error) throw friends2Res.error

    const recipientSet = new Set<string>()

    if (followers) {
      for (const f of followers) {
        if (f.follower_id && f.follower_id !== actorId) {
          recipientSet.add(f.follower_id)
        }
      }
    }

    if (friends1Res.data) {
      for (const f of friends1Res.data) {
        if (f.user2_id && f.user2_id !== actorId) {
          recipientSet.add(f.user2_id)
        }
      }
    }
    if (friends2Res.data) {
      for (const f of friends2Res.data) {
        if (f.user1_id && f.user1_id !== actorId) {
          recipientSet.add(f.user1_id)
        }
      }
    }

    const recipientIds = Array.from(recipientSet)

    // For each recipient, dispatch a notification (for now, log to console: [Notification] Sent notification to user ${recipientId} for activity ${record.id}).
    for (const recipientId of recipientIds) {
      console.log(`[Notification] Sent notification to user ${recipientId} for activity ${activityId}`)
    }

    return new Response(
      JSON.stringify({ success: true, notified: recipientIds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    const error = err as Error
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

if (import.meta.main) {
  Deno.serve(handler)
}
