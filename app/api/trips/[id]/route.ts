// file: app/api/trips/[id]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tripId = params.id;
  const supabase = await createClient();

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("*, trip_wineries(*, wineries(*))")
    .eq("id", tripId)
    .or(`user_id.eq.${user.id},members.cs.{${user.id}}`)
    .single();

  if (tripError) {
    console.error("Error fetching trip:", tripError);
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const formattedTrip = {
    ...trip,
    wineries: trip.trip_wineries
      .sort((a, b) => a.visit_order - b.visit_order)
      .map(tw => formatWinery(tw.wineries))
      .filter(Boolean),
  };

  return NextResponse.json(formattedTrip);
}
