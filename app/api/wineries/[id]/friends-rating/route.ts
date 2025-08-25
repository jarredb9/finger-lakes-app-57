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

    // 1. Get the current user's friends
    const { data: friendsData, error: friendsError } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .eq('status', 'accepted');

    if (friendsError) {
        console.error("Error fetching friends:", friendsError);
        return NextResponse.json({ error: "Failed to fetch friends." }, { status: 500 });
    }

    const friendIds = friendsData.map(f => f.user1_id === user.id ? f.user2_id : f.user1_id);

    if (friendIds.length === 0) {
        return NextResponse.json([]);
    }

    // 2. Get visits for that winery from those friends
    const { data: ratings, error: ratingsError } = await supabase
        .from('visits')
        .select(`
            rating,
            user_review,
            user_id,
            profiles:users (
                name
            )
        `)
        .eq('winery_id', wineryId)
        .in('user_id', friendIds);

    if (ratingsError) {
        console.error("Error fetching ratings:", ratingsError);
        return NextResponse.json({ error: "Failed to fetch ratings." }, { status: 500 });
    }

    // Format the response to be more client-friendly
    const formattedRatings = ratings.map(r => ({
        ...r,
        name: Array.isArray(r.profiles) ? r.profiles[0]?.name : r.profiles?.name || 'A friend'
    }));


    return NextResponse.json(formattedRatings);
}