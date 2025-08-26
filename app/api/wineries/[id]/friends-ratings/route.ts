// File: app/api/wineries/[id]/friends-ratings/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wineryId = parseInt(params.id, 10);
    if (isNaN(wineryId)) {
        return NextResponse.json({ error: "Invalid winery ID" }, { status: 400 });
    }

    const supabase = await createClient();

    try {
        // 1. Get the current user's friends
        const { data: friendsData, error: friendsError } = await supabase
            .from('friends')
            .select('user1_id, user2_id')
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
            .eq('status', 'accepted');

        if (friendsError) throw friendsError;

        const friendIds = friendsData.map(f => f.user1_id === user.id ? f.user2_id : f.user1_id);

        if (friendIds.length === 0) {
            return NextResponse.json([]);
        }

        // 2. Get visits for that winery from those friends, joining with profiles
        const { data: ratings, error: ratingsError } = await supabase
            .from('visits')
            .select(`
                rating,
                user_review,
                user_id,
                profiles (
                    id, name, email
                )
            `)
            .eq('winery_id', wineryId)
            .in('user_id', friendIds);

        if (ratingsError) {
            console.error("Error fetching ratings:", ratingsError);
            throw ratingsError;
        }

        // Format the response
        const formattedRatings = ratings.map(r => ({
            rating: r.rating,
            user_review: r.user_review,
            user_id: r.user_id,
            name: r.profiles?.name || 'A friend'
        }));


        return NextResponse.json(formattedRatings);
    } catch (error) {
        console.error("Internal error fetching friend ratings:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}