import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  const supabase = await createClient();

  if (date) {
    // Get a single trip for a specific date
    const { data: trip, error } = await supabase
      .from("trips")
      .select("*, trip_wineries(*, wineries(*))")
      .eq("user_id", user.id)
      .eq("trip_date", date)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!trip) return NextResponse.json(null);

    const sortedWineries = trip.trip_wineries.sort((a, b) => a.visit_order - b.visit_order).map(tw => tw.wineries);

    return NextResponse.json({ ...trip, wineries: sortedWineries });

  } else {
    // Get all trips for the user
    const { data: trips, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", user.id)
      .order("trip_date", { ascending: false });

    if (error) throw error;
    return NextResponse.json(trips);
  }
}

export async function POST(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { date, wineryId, name } = await request.json();
    if (!date || !wineryId) return NextResponse.json({ error: "Date and wineryId are required" }, { status: 400 });

    const supabase = await createClient();

    // Check if a trip already exists for this date
    let { data: trip, error: findTripError } = await supabase
        .from("trips")
        .select("id, trip_wineries(winery_id, visit_order)")
        .eq("user_id", user.id)
        .eq("trip_date", date)
        .single();

    if (findTripError && findTripError.code !== 'PGRST116') throw findTripError;
    
    // If no trip exists, create one
    if (!trip) {
        const { data: newTrip, error: createTripError } = await supabase
            .from("trips")
            .insert({ user_id: user.id, trip_date: date, name })
            .select("id, trip_wineries(winery_id, visit_order)")
            .single();

        if (createTripError) throw createTripError;
        trip = newTrip;
    }

    if (!trip) return NextResponse.json({ error: "Failed to create or find trip" }, { status: 500 });

    // Check if the winery is already in the trip
    if (trip.trip_wineries.some((tw: any) => tw.winery_id === wineryId)) {
      return NextResponse.json({ success: true, message: "Winery is already in this trip." });
    }
    
    const maxOrder = Math.max(0, ...trip.trip_wineries.map((tw: any) => tw.visit_order));

    // Add the winery to the trip
    const { error: addWineryError } = await supabase
        .from("trip_wineries")
        .insert({ trip_id: trip.id, winery_id: wineryId, visit_order: maxOrder + 1 });

    if (addWineryError) throw addWineryError;

    return NextResponse.json({ success: true });
}