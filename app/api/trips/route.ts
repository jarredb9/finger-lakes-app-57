// file: app/api/trips/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";
import { Visit } from "@/lib/types";

// This represents the raw data structure of a winery coming from the database/API
interface RawWinery {
  id: number;
  google_place_id: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  phone?: string;
  website?: string;
  google_rating?: number;
  opening_hours?: any;
}

interface TripWinery {
  wineries: RawWinery | null;
  visit_order: number;
  notes: string | null;
}

interface TripWithWineries {
  id: any;
  name: any;
  trip_date: any;
  members: any;
  wineries: TripWinery[];
}

interface TripWithWineryCount {
  id: any;
  name: any;
  trip_date: any;
  members: any;
  wineries_count: { count: number }[];
}

// This formatWinery function is now simpler as we will attach visits later.
const formatWinery = (winery: RawWinery | null) => {
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
        openingHours: winery.opening_hours,
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
        if (trip.trip_wineries) {
            trip.trip_wineries.forEach((tw: TripWinery) => tw.wineries?.id && allWineryIds.add(tw.wineries.id));
        }
        if (trip.members) {
            trip.members.forEach((memberId: string) => allMemberIds.add(memberId));
        }
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
    const visitsByWinery = new Map<number, Visit[]>();
    visits?.forEach((visit: any) => {
        if (!visitsByWinery.has(visit.winery_id)) {
            visitsByWinery.set(visit.winery_id, []);
        }
        visitsByWinery.get(visit.winery_id)?.push(visit);
    });

    // 5. Attach the relevant visits to each winery in each trip
    const formattedTrips = trips.map(trip => {
        const wineriesWithVisits = trip.trip_wineries
          .sort((a: TripWinery, b: TripWinery) => a.visit_order - b.visit_order)
          .map((tw: TripWinery) => {
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
        return { ...trip, wineries: wineriesWithVisits };
    });

    return NextResponse.json(formattedTrips);
  } 
  
  // Logic for the paginated "All Trips" page (remains unchanged)
  else {
    const type = searchParams.get("type") || "upcoming";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "6", 10);
    const fullData = searchParams.get("full"); // ** FIX: Read the new 'full' query param **
    const rangeFrom = (page - 1) * limit;
    const rangeTo = rangeFrom + limit - 1;
    const today = new Date().toISOString().split("T")[0];

    // ** FIX: Fetch the count of wineries using a nested select to optimize performance. **
    // ** FIX: Dynamically adjust the query based on the 'full' parameter **
    let query = supabase
      .from("trips")
      .select(`
          id,
          name,
          trip_date,
          members,
          ${fullData ? 'wineries:trip_wineries(*, wineries(*))' : 'wineries_count:trip_wineries(count)'}
      `, { count: 'exact' })
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
    
    // We need to re-format the data to get the winery count
    const formattedTrips = trips?.map((t: TripWithWineries | TripWithWineryCount) => {
      if ('wineries' in t) {
        const wineries_count = t.wineries?.length || 0;
        const wineries = t.wineries.map((tw: TripWinery) => formatWinery(tw.wineries));
        return { ...t, wineries_count, wineries };
      } else {
        const wineries_count = t.wineries_count?.[0]?.count || 0;
        return { ...t, wineries_count, wineries: [] };
      }
    });

    return NextResponse.json({ trips: formattedTrips || [], count: count || 0 });
  }
}

export async function POST(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const supabase = await createClient();

    // Scenario 1: Creating a new trip with multiple wineries (from TripForm)
    if (body.name && body.trip_date && Array.isArray(body.wineries)) {
        const { name, trip_date, wineries } = body;

        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date, name, members: [user.id] })
            .select("id")
            .single();

        if (createTripError) throw createTripError;

        if (wineries.length > 0) {
            const tripWineriesToInsert = wineries.map((winery: { dbId: number }, index: number) => ({
                trip_id: newTrip.id,
                winery_id: winery.dbId,
                visit_order: index,
            }));

            const { error: addWineriesError } = await supabase
                .from("trip_wineries")
                .insert(tripWineriesToInsert);

            if (addWineriesError) throw addWineriesError;
        }

        return NextResponse.json({ success: true, tripId: newTrip.id });
    }

    // Scenario 2: Adding a single winery to one or more trips (from WineryModal)
    const { date, wineryId, name, tripIds, notes } = body;
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    let targetTripIds: number[] = [];

    if (name) { // Creating a new trip while adding a winery
        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date: date, name: name, members: [user.id] })
            .select("id")
            .single();
        if (createTripError) throw createTripError;
        targetTripIds.push(newTrip.id);
    }

    if (tripIds && Array.isArray(tripIds)) {
        targetTripIds = [...targetTripIds, ...tripIds];
    }

    if (wineryId && targetTripIds.length > 0) {
        const addWineryPromises = targetTripIds.map(async (tripId) => {
            const { data: existing, error } = await supabase.from("trip_wineries").select('visit_order').eq("trip_id", tripId).order('visit_order', { ascending: false }).limit(1).single();
            if (error && error.code !== 'PGRST116') throw error; // Ignore 'not found'
            const maxOrder = existing?.visit_order ?? -1;
            return supabase.from("trip_wineries").insert({ trip_id: tripId, winery_id: wineryId, visit_order: maxOrder + 1, notes });
        });

        await Promise.all(addWineryPromises);
    }

    return NextResponse.json({ success: true, tripIds: targetTripIds });
}