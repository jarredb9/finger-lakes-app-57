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
            return NextResponse.json({ favoritedBy: [], wishlistedBy: [] });
        }

        // 2. Fetch friends who have favorited this winery
        const { data: favoritedByData, error: favoritesError } = await supabase
            .from('favorites')
            .select('profiles(id, name, email)')
            .eq('winery_id', wineryId)
            .in('user_id', friendIds);

        if (favoritesError) throw favoritesError;
        
        // 3. Fetch friends who have this winery on their wishlist
        const { data: wishlistedByData, error: wishlistError } = await supabase
            .from('wishlist')
            .select('profiles(id, name, email)')
            .eq('winery_id', wineryId)
            .in('user_id', friendIds);

        if (wishlistError) throw wishlistError;

        // 4. Format the data for the client
        const favoritedBy = favoritedByData?.map(f => f.profiles).filter(Boolean) || [];
        const wishlistedBy = wishlistedByData?.map(w => w.profiles).filter(Boolean) || [];
        
        return NextResponse.json({ favoritedBy, wishlistedBy });

    } catch (error) {
        console.error("Internal error fetching friend activity:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}