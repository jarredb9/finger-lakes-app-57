import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  console.log("GET /api/trips called");
  const user = await getUser();
  if (!user) {
    console.error("Unauthorized access to /api/trips");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  const supabase = await createClient();

  if (date) {
    console.log(`Fetching trip for user ${user.id} on date ${date}`);
    const { data: trip, error } = await supabase
      .from("trips")
      .select("*, trip_wineries(*, wineries(*))")
      .eq("user_id", user.id)
      .eq("trip_date", date)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching trip:", error);
      throw error;
    }
    if (!trip) {
      console.log("No trip found for the specified date.");
      return NextResponse.json(null);
    }

    const sortedWineries = trip.trip_wineries.sort((a, b) => a.visit_order - b.visit_order).map(tw => tw.wineries);
    console.log("Returning trip data:", { ...trip, wineries: sortedWineries });
    return NextResponse.json({ ...trip, wineries: sortedWineries });

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
    return NextResponse.json(trips);
  }
}

export async function POST(request: NextRequest) {
    console.log("POST /api/trips called");
    const user = await getUser();
    if (!user) {
        console.error("Unauthorized POST to /api/trips");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { date, wineryId, name } = await request.json();
    console.log("Request body:", { date, wineryId, name });
    if (!date || !wineryId) {
        console.error("Missing date or wineryId in request body");
        return NextResponse.json({ error: "Date and wineryId are required" }, { status: 400 });
    }

    const supabase = await createClient();

    console.log(`Finding trip for user ${user.id} on date ${date}`);
    let { data: trip, error: findTripError } = await supabase
        .from("trips")
        .select("id, trip_wineries(winery_id, visit_order)")
        .eq("user_id", user.id)
        .eq("trip_date", date)
        .single();

    if (findTripError && findTripError.code !== 'PGRST116') {
        console.error("Error finding trip:", findTripError);
        throw findTripError;
    }
    
    if (!trip) {
        console.log("No trip found, creating a new one.");
        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date: date, name })
            .select("id, trip_wineries(winery_id, visit_order)")
            .single();

        if (createTripError) {
            console.error("Error creating trip:", createTripError);
            throw createTripError;
        }
        trip = newTrip;
        console.log("New trip created:", trip);
    }

    if (!trip) {
        console.error("Failed to create or find trip.");
        return NextResponse.json({ error: "Failed to create or find trip" }, { status: 500 });
    }

    if (trip.trip_wineries.some((tw: any) => tw.winery_id === wineryId)) {
      console.log("Winery is already in this trip.");
      return NextResponse.json({ success: true, message: "Winery is already in this trip." });
    }
    
    const maxOrder = Math.max(0, ...trip.trip_wineries.map((tw: any) => tw.visit_order));
    console.log(`Adding winery ${wineryId} to trip ${trip.id} with order ${maxOrder + 1}`);
    const { error: addWineryError } = await supabase
        .from("trip_wineries")
        .insert({ trip_id: trip.id, winery_id: wineryId, visit_order: maxOrder + 1 });

    if (addWineryError) {
        console.error("Error adding winery to trip:", addWineryError);
        throw addWineryError;
    }

    console.log("Winery added to trip successfully.");
    return NextResponse.json({ success: true });
}