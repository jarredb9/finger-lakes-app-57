import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/auth";

// GET handler to fetch friends and friend requests
export async function GET() {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    try {
        const { data, error } = await supabase.rpc('get_friends_and_requests');

        if (error) {
            console.error("Error calling get_friends_and_requests RPC:", error);
            throw error;
        }

        // The RPC returns { friends: [...], requests: [...] }
        return NextResponse.json(data || { friends: [], requests: [] });

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
        
        // Use admin client to find the user by email to bypass potential RLS restrictions on listing users
        // and to allow for case-insensitive search if configured differently in DB.
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Find the user to whom the request is being sent
        // Using ilike for case-insensitive matching and trimming whitespace
        const { data: friendUser, error: findError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .ilike('email', email.trim())
            .single();
            
        if (findError || !friendUser) {
            if (findError && findError.code !== 'PGRST116') {
                console.error("Error finding user by email:", findError);
            }
            return NextResponse.json({ error: "User not found." }, { status: 404 });
        }

        if (friendUser.id === user.id) {
            return NextResponse.json({ error: "You cannot add yourself as a friend." }, { status: 400 });
        }

        // Check for existing relationship in EITHER direction
        const { data: existingRows, error: checkError } = await supabase
            .from('friends')
            .select('*')
            .or(`and(user1_id.eq.${user.id},user2_id.eq.${friendUser.id}),and(user1_id.eq.${friendUser.id},user2_id.eq.${user.id})`);

        if (checkError) {
             console.error("Error checking existing friend status:", checkError);
        }

        if (existingRows && existingRows.length > 0) {
             // Check if ANY of the existing rows are active
             const accepted = existingRows.find(r => r.status === 'accepted');
             if (accepted) {
                 return NextResponse.json({ error: "You are already friends." }, { status: 409 });
             }
             
             const pending = existingRows.find(r => r.status === 'pending');
             if (pending) {
                 return NextResponse.json({ error: "Friend request already sent or pending." }, { status: 409 });
             }
             
             // If we are here, all existing rows are 'declined' (or some other inactive status)
             // We pick the first one to revive.
             const rowToUpdate = existingRows[0];
             
             // We update the existing row to be a NEW request from ME (user.id) -> THEM (friendUser.id)
             const { error: updateError } = await supabase
                .from('friends')
                .update({ 
                    status: 'pending', 
                    user1_id: user.id, 
                    user2_id: friendUser.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', rowToUpdate.id);
            
             if (updateError) {
                 console.error("Error updating declined friend request:", updateError);
                 throw updateError;
             }
             
             // Optional: If there are multiple "declined" rows (duplicates), we could delete the others
             // but let's just revive one for now.
             
             return NextResponse.json({ success: true });
        }

        // Insert a new pending friend request if no prior record exists
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
         console.error("Error in /api/friends POST:", error);
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

// DELETE handler to remove a friend
export async function DELETE(request: NextRequest) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { friendId } = await request.json();
        if (!friendId) {
            return NextResponse.json({ error: "Friend ID is required" }, { status: 400 });
        }

        const supabase = await createClient();

        // Call the RPC to remove the friend
        const { error } = await supabase.rpc('remove_friend', { target_friend_id: friendId });

        if (error) {
            console.error("Error removing friend via RPC:", error);
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error in /api/friends DELETE:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
