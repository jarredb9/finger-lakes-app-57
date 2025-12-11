// file: app/api/trips/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

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
  const supabase = await createClient();

  // Logic for the paginated "All Trips" page
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
    const { date, wineryId, name, tripIds, notes } = body; // from WineryModal
    const { wineryId: singleWineryId, tripIds: singleTripIds, date: singleDate } = body; // from TripCard toggle

    const effectiveDate = date || singleDate;
    const effectiveWineryId = wineryId || singleWineryId;
    let targetTripIds: number[] = tripIds || singleTripIds || [];

    if (!effectiveDate) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    if (name) { // Creating a new trip while adding a winery
        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date: effectiveDate, name: name, members: [user.id] })
            .select("id")
            .single();
        if (createTripError) throw createTripError;
        targetTripIds.push(newTrip.id);
    }

    if (effectiveWineryId && targetTripIds.length > 0) {
        const addWineryPromises = targetTripIds.map(async (tripId) => {
            const { data: existing, error } = await supabase.from("trip_wineries").select('visit_order').eq("trip_id", tripId).order('visit_order', { ascending: false }).limit(1).single();
            if (error && error.code !== 'PGRST116') throw error; // Ignore 'not found'
            const maxOrder = existing?.visit_order ?? -1;
            return supabase.from("trip_wineries").insert({ trip_id: tripId, winery_id: effectiveWineryId, visit_order: maxOrder + 1, notes });
        });

        await Promise.all(addWineryPromises);
    }

    return NextResponse.json({ success: true, tripIds: targetTripIds });
}