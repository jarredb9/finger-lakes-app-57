import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

const formatWinery = (winery: any, visit?: any) => {
    if (!winery) return null;
    return {
        id: winery.google_place_id,
        dbId: winery.id,
        name: winery.name,
        address: winery.address,
        lat: parseFloat(winery.latitude),
        lng: parseFloat(winery.longitude),
        phone: winery.phone,
        website: winery.website,
        rating: winery.google_rating,
        userVisit: visit ? {
            rating: visit.rating,
            user_review: visit.user_review,
        } : undefined,
    };
};

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const supabase = await createClient();

  // This logic is for the Trip Planner and remains unchanged
  if (date) {
    const { data: trips, error } = await supabase
      .from("trips")
      .select("*, trip_wineries(*, wineries(*))")
      .eq("user_id", user.id)
      .eq("trip_date", date);

    if (error) throw error;
    if (!trips) return NextResponse.json([]);

    const { data: visits, error: visitsError } = await supabase
        .from("visits")
        .select("winery_id, rating, user_review")
        .eq("user_id", user.id);
    
    if(visitsError) throw visitsError;
    const visitsMap = new Map(visits.map(v => [v.winery_id, v]));

    const formattedTrips = trips.map(trip => {
        const sortedWineries = trip.trip_wineries
          .sort((a, b) => a.visit_order - b.visit_order)
          .map(tw => {
              const wineryData = formatWinery(tw.wineries, visitsMap.get(tw.winery_id));
              return { ...wineryData, notes: tw.notes };
          })
          .filter(Boolean);
        return { ...trip, wineries: sortedWineries };
    });

    return NextResponse.json(formattedTrips);
  } 
  
  // ** NEW LOGIC FOR PAGINATED "All Trips" page **
  else {
    const type = searchParams.get("type") || "upcoming"; // Default to 'upcoming'
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "6", 10);
    const rangeFrom = (page - 1) * limit;
    const rangeTo = rangeFrom + limit - 1;
    const today = new Date().toISOString().split("T")[0];

    let query = supabase
      .from("trips")
      .select("*", { count: 'exact' })
      .eq("user_id", user.id);

    if (type === 'upcoming') {
        query = query.gte('trip_date', today).order("trip_date", { ascending: true });
    } else { // 'past'
        query = query.lt('trip_date', today).order("trip_date", { ascending: false });
    }
    
    const { data: trips, error, count } = await query.range(rangeFrom, rangeTo);

    if (error) {
        console.error(`Error fetching ${type} trips:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ trips: trips || [], count: count || 0 });
  }
}

export async function POST(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { date, wineryId, name, tripId, notes } = await request.json();
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    const supabase = await createClient();
    let targetTripId = tripId;

    if (!targetTripId) {
        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date: date, name: name || `Trip for ${date}` })
            .select("id")
            .single();
        if (createTripError) throw createTripError;
        targetTripId = newTrip.id;
    }

    if (wineryId) {
        const { data: tripWineries, error: orderError } = await supabase
            .from("trip_wineries").select("visit_order").eq("trip_id", targetTripId);
        if(orderError) throw orderError;
        
        const maxOrder = Math.max(0, ...tripWineries.map(tw => tw.visit_order));
        
        const { error: addWineryError } = await supabase
            .from("trip_wineries")
            .insert({ trip_id: targetTripId, winery_id: wineryId, visit_order: maxOrder + 1, notes });

        if (addWineryError && addWineryError.code !== '23505') {
            throw addWineryError;
        }
    }
    return NextResponse.json({ success: true, tripId: targetTripId });
}