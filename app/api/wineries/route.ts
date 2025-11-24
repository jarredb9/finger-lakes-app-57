import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const supabase = await createClient();

    // If a search query is provided, use Google Places API
    if (query) {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            console.error('[API] /api/wineries: Google Maps API Key is not set.');
            return NextResponse.json({ error: 'Google Maps API Key is not configured.' }, { status: 500 });
        }
        // Append "winery" to the query to improve search relevance, mirroring the trip-form implementation.
        const enhancedQuery = `${query} winery`;
        console.log(`[API] /api/wineries: Received search query "${query}", enhanced to "${enhancedQuery}"`);
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(enhancedQuery)}&type=winery&key=${apiKey}`;

        try {
            console.log(`[API] /api/wineries: Fetching from Google Places API: ${url}`);
            const response = await fetch(url);
            const data = await response.json();

            console.log(`[API] /api/wineries: Google Places API response status: ${data.status}`);

            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                console.error('[API] /api/wineries: Google Places API returned non-OK status:', data.status, data.error_message);
                return NextResponse.json({ error: 'Failed to fetch from Google Places API', details: data.status }, { status: 500 });
            }

            console.log(`[API] /api/wineries: Found ${data.results?.length || 0} results from Google.`);
            const searchResults = data.results.map((place: any) => ({
                id: place.place_id,
                name: place.name,
                address: place.formatted_address,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng,
                rating: place.rating,
            }));

            console.log('[API] /api/wineries: Sending formatted results to client.');
            return NextResponse.json(searchResults);

        } catch (error) {
            console.error('[API] /api/wineries: Error fetching from Google Places API:', error);
            return NextResponse.json({ error: "Internal server error during Google search" }, { status: 500 });
        }
    } 
    // Otherwise, fetch all wineries from the database
    else {
        try {
            const { data: wineries, error } = await supabase
                .from('wineries')
                .select('*');

            if (error) {
                throw error;
            }
            // Standardize the output to match the Winery type
            const formattedWineries = wineries.map(w => ({
                id: w.google_place_id,
                dbId: w.id,
                ...w
            }));
            return NextResponse.json(formattedWineries || []);
        } catch (error) {
            console.error("Error fetching all wineries:", error);
            return NextResponse.json({ error: "Internal server error" }, { status: 500 });
        }
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