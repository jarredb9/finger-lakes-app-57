import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";
import { Friend } from "@/lib/types";

// GET handler to fetch friends and friend requests
export async function GET() {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    try {
        // --- Get Friends ---
        const { data: friendsData, error: friendsError } = await supabase
            .from('friends')
            .select('user1_id, user2_id')
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
            .eq('status', 'accepted');

        if (friendsError) throw friendsError;

        const friendIds = friendsData.map(f => f.user1_id === user.id ? f.user2_id : f.user1_id);

        let friends: Friend[] = [];
        if (friendIds.length > 0) {
            const { data: profiles, error: usersError } = await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', friendIds);
            if (usersError) throw usersError;
            friends = profiles || [];
        }

        // --- Get Requests ---
        const { data: requestsData, error: requestsError } = await supabase
            .from('friends')
            .select('user1_id')
            .eq('user2_id', user.id)
            .eq('status', 'pending');

        if (requestsError) throw requestsError;
        
        const requestorIds = requestsData.map(r => r.user1_id);

        let requests: Friend[] = [];
        if (requestorIds.length > 0) {
             const { data: profiles, error: requestUsersError } = await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', requestorIds);

            if (requestUsersError) throw requestUsersError;
            requests = profiles || [];
        }

        return NextResponse.json({ friends, requests });

    } catch (error) {
        console.error("Error in /api/friends GET:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST handler to send a new friend request
export async function POST(request: NextRequest) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { email } = await request.json();
        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const supabase = await createClient();

        // Find the user to whom the request is being sent
        const { data: friendUser, error: findError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single();
            
        if (findError || !friendUser) {
            return NextResponse.json({ error: "User not found." }, { status: 404 });
        }

        if (friendUser.id === user.id) {
            return NextResponse.json({ error: "You cannot add yourself as a friend." }, { status: 400 });
        }

        // Insert a new pending friend request
        const { error: insertError } = await supabase
            .from('friends')
            .insert({ user1_id: user.id, user2_id: friendUser.id, status: 'pending' });

        if (insertError) {
            if (insertError.code === '23505') { // unique constraint violation
                return NextResponse.json({ error: "Friend request already sent or you are already friends." }, { status: 409 });
            }
            console.error("Error inserting friend request:", insertError);
            throw insertError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
         return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PUT handler to accept or decline a friend request
export async function PUT(request: NextRequest) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { requesterId, accept } = await request.json();
        if (!requesterId) {
            return NextResponse.json({ error: "Requester ID is required" }, { status: 400 });
        }

        const supabase = await createClient();

        const newStatus = accept ? 'accepted' : 'declined';

        // Update the status of the friend request
        const { error } = await supabase
            .from('friends')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('user1_id', requesterId)
            .eq('user2_id', user.id)
            .eq('status', 'pending');

        if (error) {
            console.error("Error updating friend request:", error);
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch(error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
