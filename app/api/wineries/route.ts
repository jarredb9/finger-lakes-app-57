import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from '@supabase/supabase-js';
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
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(enhancedQuery)}&type=winery&key=${apiKey}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                console.error('[API] /api/wineries: Google Places API returned non-OK status:', data.status, data.error_message);
                return NextResponse.json({ error: 'Failed to fetch from Google Places API', details: data.status }, { status: 500 });
            }

            const searchResults = data.results.map((place: any) => ({
                id: place.place_id,
                name: place.name,
                address: place.formatted_address,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng,
                rating: place.rating,
            }));

            // CACHING STRATEGY:
            // Silently upsert these results into our database so future "details" calls 
            // and map loads can be served from our own cache.
            (async () => {
                try {
                    const supabaseAdmin = createAdminClient(
                        process.env.NEXT_PUBLIC_SUPABASE_URL!,
                        process.env.SUPABASE_SERVICE_ROLE_KEY!
                    );

                    const dbWineries = data.results.map((place: any) => ({
                        google_place_id: place.place_id,
                        name: place.name,
                        address: place.formatted_address,
                        latitude: place.geometry.location.lat,
                        longitude: place.geometry.location.lng,
                        google_rating: place.rating,
                    }));

                    const { error } = await supabaseAdmin
                        .from('wineries')
                        .upsert(dbWineries, { onConflict: 'google_place_id' });
                        
                    if (error) {
                         console.error('[API] /api/wineries: Background cache update failed:', error);
                    }
                } catch (cacheError) {
                    console.error('[API] /api/wineries: Background cache error:', cacheError);
                }
            })();

            return NextResponse.json(searchResults);

        } catch (error) {
            console.error('[API] /api/wineries: Error fetching from Google Places API:', error);
            return NextResponse.json({ error: "Internal server error during Google search" }, { status: 500 });
        }
    } 
    // Otherwise, fetch paginated wineries from the database
    else {
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "20", 10);
        const rangeFrom = (page - 1) * limit;
        const rangeTo = rangeFrom + limit - 1;

        try {
            const { data: wineries, error, count } = await supabase
                .from('wineries')
                .select('*', { count: 'exact' })
                .range(rangeFrom, rangeTo);

            if (error) {
                throw error;
            }
            // Standardize the output to match the Winery type
            const formattedWineries = wineries.map(w => ({
                id: w.google_place_id,
                dbId: w.id,
                ...w
            }));
            return NextResponse.json({ wineries: formattedWineries || [], count: count || 0 });
        } catch (error) {
            console.error("Error fetching wineries:", error);
            return NextResponse.json({ error: "Internal server error" }, { status: 500 });
        }
    }
}