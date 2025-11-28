// File: app/api/wineries/[id]/friends-ratings/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

interface Rating {
  id: number;
  rating: number;
  user_review: string;
  photos: string[];
  user_id: string;
  profiles: {
    id: string;
    name: string;
    email: string;
  }[] | null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wineryId = parseInt(id, 10);
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
                id,
                rating,
                user_review,
                photos,
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

        // 3. Generate signed URLs for photos
        if (ratings) {
            for (const rating of ratings) {
                if (rating.photos && rating.photos.length > 0) {
                    const { data: signedUrlsData, error: urlError } = await supabase.storage
                        .from('visit-photos')
                        .createSignedUrls(rating.photos, 3600); // 1 hour

                    if (urlError) {
                        console.error(`Error creating signed URLs for visit ${rating.id}:`, urlError);
                        rating.photos = [];
                    } else {
                        rating.photos = signedUrlsData.map(item => item.signedUrl);
                    }
                }
            }
        }

        // Format the response
        const formattedRatings = ratings.map((r: Rating) => ({
            rating: r.rating,
            user_review: r.user_review,
            photos: r.photos || [],
            user_id: r.user_id,
            name: r.profiles?.[0]?.name || 'A friend'
        }));


        return NextResponse.json(formattedRatings);
    } catch (error) {
        console.error("Internal error fetching friend ratings:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}