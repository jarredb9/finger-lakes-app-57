import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

// This formatWinery function is now simpler as we will attach visits later.
const formatWinery = (winery: any) => {
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
    };
};

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const supabase = await createClient();

  // Logic for the Trip Planner page
  if (date) {
    // 1. Fetch trips for the user (owned or member of) on a specific date
    const { data: trips, error: tripsError } = await supabase
      .from("trips")
      .select("*, trip_wineries(*, wineries(*))")
      .or(`user_id.eq.${user.id},members.cs.{${user.id}}`)
      .eq("trip_date", date);

    if (tripsError) throw tripsError;
    if (!trips) return NextResponse.json([]);
    
    // 2. Collect all winery IDs and member IDs from the fetched trips
    const allWineryIds = new Set<number>();
    const allMemberIds = new Set<string>();
    trips.forEach(trip => {
        trip.trip_wineries.forEach(tw => tw.wineries?.id && allWineryIds.add(tw.wineries.id));
        trip.members?.forEach(memberId => allMemberIds.add(memberId));
        allMemberIds.add(trip.user_id); // Also include the trip owner
    });

    if (allWineryIds.size === 0 || allMemberIds.size === 0) {
        return NextResponse.json(trips);
    }
    
    // 3. Fetch all visits for those wineries from any of the members THAT OCCURRED ON THE TRIP DATE
    const { data: visits, error: visitsError } = await supabase
        .from("visits")
        .select("*, profiles(name)")
        .in("winery_id", Array.from(allWineryIds))
        .in("user_id", Array.from(allMemberIds))
        // ** THE FIX IS HERE: Only get visits that match the trip's date. **
        .eq("visit_date", date);

    if(visitsError) throw visitsError;

    // 4. Group the visits by winery_id for easy lookup
    const visitsByWinery = new Map<number, any[]>();
    visits?.forEach(visit => {
        if (!visitsByWinery.has(visit.winery_id)) {
            visitsByWinery.set(visit.winery_id, []);
        }
        visitsByWinery.get(visit.winery_id)?.push(visit);
    });

    // 5. Attach the relevant visits to each winery in each trip
    const formattedTrips = trips.map(trip => {
        const wineriesWithVisits = trip.trip_wineries
          .sort((a, b) => a.visit_order - b.visit_order)
          .map(tw => {
              const wineryData = formatWinery(tw.wineries);
              if (wineryData) {
                  return { 
                      ...wineryData, 
                      notes: tw.notes,
                      visits: visitsByWinery.get(wineryData.dbId) || [], // Attach the visits
                  };
              }
              return null;
          })
          .filter(Boolean);
        return { ...trip, wineries: wineriesWithVisits as any[] };
    });

    return NextResponse.json(formattedTrips);
  } 
  
  // Logic for the paginated "All Trips" page (remains unchanged)
  else {
    const type = searchParams.get("type") || "upcoming";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "6", 10);
    const rangeFrom = (page - 1) * limit;
    const rangeTo = rangeFrom + limit - 1;
    const today = new Date().toISOString().split("T")[0];

    let query = supabase
      .from("trips")
      .select("*", { count: 'exact' })
      .or(`user_id.eq.${user.id},members.cs.{${user.id}}`);

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
            .insert({ user_id: user.id, trip_date: date, name: name || `Trip for ${date}`, members: [user.id] })
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