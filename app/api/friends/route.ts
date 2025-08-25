import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = await createClient();

    // Fetch accepted friendships
    const { data: friendsData, error: friendsError } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .eq('status', 'accepted');

    if (friendsError) throw friendsError;

    const friendIds = friendsData.map(f => f.user1_id === user.id ? f.user2_id : f.user1_id);

    const { data: friends, error: usersError } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', friendIds);

    if (usersError) throw usersError;

    // Fetch pending friend requests
    const { data: requestsData, error: requestsError } = await supabase
        .from('friends')
        .select('user1_id')
        .eq('user2_id', user.id)
        .eq('status', 'pending');

    if (requestsError) throw requestsError;

    const requestorIds = requestsData.map(r => r.user1_id);

    const { data: requests, error: requestUsersError } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', requestorIds);

    if (requestUsersError) throw requestUsersError;

    return NextResponse.json({ friends, requests });
}

export async function POST(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const supabase = await createClient();

    const { data: friendUser, error: findError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

    if (findError || !friendUser) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (friendUser.id === user.id) {
        return NextResponse.json({ error: "You cannot add yourself as a friend." }, { status: 400 });
    }

    const { error: insertError } = await supabase
        .from('friends')
        .insert({ user1_id: user.id, user2_id: friendUser.id, status: 'pending' });

    if (insertError) {
        if (insertError.code === '23505') { // unique constraint violation
            return NextResponse.json({ error: "Friend request already sent." }, { status: 409 });
        }
        throw insertError;
    }

    return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { requesterId, accept } = await request.json();
    if (!requesterId) return NextResponse.json({ error: "Requester ID is required" }, { status: 400 });

    const supabase = await createClient();

    const newStatus = accept ? 'accepted' : 'declined';

    const { error } = await supabase
        .from('friends')
        .update({ status: newStatus })
        .eq('user1_id', requesterId)
        .eq('user2_id', user.id)
        .eq('status', 'pending');

    if (error) throw error;

    return NextResponse.json({ success: true });
}