import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

// Helper to format winery data consistently
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
  console.log("GET /api/trips called");
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const supabase = await createClient();

  if (date) {
    console.log(`Fetching trips for user ${user.id} on date ${date}`);
    // CORRECTED: Removed .single() to fetch multiple trips for a single day
    const { data: trips, error } = await supabase
      .from("trips")
      .select("*, trip_wineries(*, wineries(*))")
      .eq("user_id", user.id)
      .eq("trip_date", date);

    if (error) {
      console.error("Error fetching trips for date:", error);
      throw error;
    }
    
    if (!trips) {
      return NextResponse.json([]);
    }

    const formattedTrips = trips.map(trip => {
        const sortedWineries = trip.trip_wineries
          .sort((a, b) => a.visit_order - b.visit_order)
          .map(tw => formatWinery(tw.wineries))
          .filter(Boolean);
        return { ...trip, wineries: sortedWineries };
    });

    console.log("Returning trips data for date:", formattedTrips);
    return NextResponse.json(formattedTrips);

  } else {
    console.log(`Fetching all trips for user ${user.id}`);
    const { data: trips, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", user.id)
      .order("trip_date", { ascending: false });

    if (error) {
      console.error("Error fetching all trips:", error);
      throw error;
    }
    console.log("Returning all trips:", trips);
    return NextResponse.json(trips || []);
  }
}

export async function POST(request: NextRequest) {
    console.log("POST /api/trips called");
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { date, wineryId, name, tripId } = await request.json();
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    const supabase = await createClient();
    let targetTripId = tripId;

    // If no tripId is provided, we are creating a new trip
    if (!targetTripId) {
        console.log("No tripId provided, creating a new trip.");
        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date: date, name: name || `Trip for ${date}` })
            .select("id")
            .single();

        if (createTripError) {
            console.error("Error creating new trip:", createTripError);
            throw createTripError;
        }
        targetTripId = newTrip.id;
        console.log("New trip created with ID:", targetTripId);
    }

    // If a wineryId is provided, add it to the trip (either the new one or the existing one)
    if (wineryId) {
        console.log(`Adding winery ${wineryId} to trip ${targetTripId}`);
        
        // Get the current max order for this trip to append the new winery
        const { data: tripWineries, error: orderError } = await supabase
            .from("trip_wineries")
            .select("visit_order")
            .eq("trip_id", targetTripId);
        
        if(orderError) {
            console.error("Error fetching trip wineries for order calculation:", orderError);
            throw orderError;
        }

        const maxOrder = Math.max(0, ...tripWineries.map(tw => tw.visit_order));

        const { error: addWineryError } = await supabase
            .from("trip_wineries")
            .insert({ trip_id: targetTripId, winery_id: wineryId, visit_order: maxOrder + 1 });

        if (addWineryError) {
            // Handle cases where the winery might already be in the trip
            if (addWineryError.code === '23505') { // unique_violation
                console.log("Winery already in trip, returning success.");
                return NextResponse.json({ success: true, message: "Winery is already in this trip." });
            }
            console.error("Error adding winery to trip:", addWineryError);
            throw addWineryError;
        }
    }

    return NextResponse.json({ success: true, tripId: targetTripId });
}