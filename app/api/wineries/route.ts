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

    // If a search query is provided, use Google Places API (New) V1
    if (query) {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            console.error('[API] /api/wineries: Google Maps API Key is not set.');
            return NextResponse.json({ error: 'Google Maps API Key is not configured.' }, { status: 500 });
        }
        // Append "winery" to the query to improve search relevance, mirroring the trip-form implementation.
        const enhancedQuery = `${query} winery`;
        const url = 'https://places.googleapis.com/v1/places:searchText';

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
                },
                body: JSON.stringify({ textQuery: enhancedQuery }),
            });

            if (!response.ok) {
                console.error('[API] /api/wineries: Google Places API (New) returned non-OK status:', response.status);
                return NextResponse.json({ error: 'Failed to fetch from Google Places API', details: response.status }, { status: response.status });
            }

            const data = await response.json();
            const places = data.places || [];

            const searchResults = places.map((place: any) => ({
                id: place.id,
                name: place.displayName?.text,
                address: place.formattedAddress,
                latitude: place.location?.latitude,
                longitude: place.location?.longitude,
                rating: place.rating,
            }));

            // CACHING STRATEGY:
            // Await upsert into our database cache so future "details" calls 
            // and map loads can be served reliably from our own cache.
            if (searchResults.length > 0 && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                try {
                    const supabaseAdmin = createAdminClient(
                        process.env.NEXT_PUBLIC_SUPABASE_URL,
                        process.env.SUPABASE_SERVICE_ROLE_KEY
                    );

                    const dbWineries = places.map((place: any) => ({
                        google_place_id: place.id,
                        name: place.displayName?.text,
                        address: place.formattedAddress,
                        latitude: place.location?.latitude,
                        longitude: place.location?.longitude,
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
            }

            return NextResponse.json(searchResults);

        } catch (error) {
            console.error('[API] /api/wineries: Error fetching from Google Places API:', error);
            return NextResponse.json({ error: "Internal server error during Google search" }, { status: 500 });
        }
    } 
    // Otherwise, fetch paginated wineries from the database using RPC
    else {
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "20", 10);

        try {
            const { data, error } = await supabase.rpc('get_paginated_wineries', { 
                p_page: page, 
                p_limit: limit 
            });

            if (error) throw error;

            const totalCount = data && data.length > 0 ? data[0].total_count : 0;
            
            // Standardize the output to match the Winery type
            const formattedWineries = data.map((w: any) => ({
                id: w.google_place_id,
                dbId: w.id,
                ...w
            }));

            return NextResponse.json({ wineries: formattedWineries || [], count: totalCount });
        } catch (error) {
            console.error("Error fetching wineries via RPC:", error);
            return NextResponse.json({ error: "Internal server error" }, { status: 500 });
        }
    }
}