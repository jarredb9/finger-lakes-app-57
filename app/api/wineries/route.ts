import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const wineryIdStr = searchParams.get("wineryId");
    const ratingsFor = searchParams.get("ratingsFor");

    if (!wineryIdStr) {
        return NextResponse.json({ error: "wineryId is required" }, { status: 400 });
    }

    const wineryId = parseInt(wineryIdStr, 10);
    if (isNaN(wineryId)) {
        return NextResponse.json({ error: "Invalid winery ID" }, { status: 400 });
    }

    const supabase = await createClient();

    // If the URL asks for friends' ratings, execute this block
    if (ratingsFor === 'friends') {
        try {
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

            const { data: ratings, error: ratingsError } = await supabase
                .from('visits')
                .select(`rating, user_review, user_id, profiles (id, name, email)`)
                .eq('winery_id', wineryId)
                .in('user_id', friendIds);

            if (ratingsError) throw ratingsError;

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

    // Handle the default request for winery details
    try {
        const { data: winery, error } = await supabase
            .from('wineries')
            .select('*')
            .eq('id', wineryId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows found
                return NextResponse.json({ error: "Winery not found" }, { status: 404 });
            }
            throw error;
        }
        return NextResponse.json(winery);
    } catch (error) {
        console.error("Error fetching winery:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// NEW POST HANDLER: Finds a winery by its Google Place ID or creates it if it doesn't exist.
// Returns the internal database ID (dbId).
export async function POST(request: NextRequest) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wineryData = await request.json();
    if (!wineryData || !wineryData.id) {
        return NextResponse.json({ error: "Winery data with Google Place ID is required" }, { status: 400 });
    }

    const supabase = await createClient();

    try {
        let { data: winery, error: findError } = await supabase
            .from("wineries")
            .select("id")
            .eq("google_place_id", wineryData.id)
            .single();

        if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows found
            throw findError;
        }

        if (!winery) {
            const { data: newWinery, error: insertError } = await supabase
                .from("wineries")
                .insert({
                    google_place_id: wineryData.id,
                    name: wineryData.name,
                    address: wineryData.address,
                    latitude: wineryData.lat,
                    longitude: wineryData.lng,
                    phone: wineryData.phone,
                    website: wineryData.website,
                    google_rating: wineryData.rating,
                })
                .select("id")
                .single();

            if (insertError) throw insertError;
            winery = newWinery;
        }
        
        return NextResponse.json({ dbId: winery.id });

    } catch (error) {
        console.error("Error in find-or-create-winery:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}