import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  console.log(`PUT /api/trips/${params.id} called`);
  const user = await getUser();
  if (!user) {
    console.error(`Unauthorized PUT to /api/trips/${params.id}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tripId = parseInt(params.id, 10);
  const { removeWineryId, wineryOrder, name } = await request.json();
  console.log("Request body:", { removeWineryId, wineryOrder, name });
  const supabase = await createClient();

  // Handle updating trip name
  if (name) {
    console.log(`Updating name for trip ${tripId} to "${name}"`);
    const { error } = await supabase
      .from("trips")
      .update({ name })
      .eq("id", tripId)
      .eq("user_id", user.id);
    
    if (error) {
      console.error("Error updating trip name:", error);
      throw error;
    }
    console.log("Trip name updated successfully.");
    return NextResponse.json({ success: true });
  }

  // Handle removing a winery
  if (removeWineryId) {
    console.log(`Removing winery ${removeWineryId} from trip ${tripId}`);
    const { error } = await supabase
      .from("trip_wineries")
      .delete()
      .eq("trip_id", tripId)
      .eq("winery_id", removeWineryId);

    if (error) {
      console.error("Error removing winery:", error);
      throw error;
    }
    console.log("Winery removed successfully.");
    return NextResponse.json({ success: true });
  }

  // Handle reordering wineries
  if (wineryOrder) {
    console.log(`Updating winery order for trip ${tripId}:`, wineryOrder);
    const updates = wineryOrder.map((wineryId: number, index: number) =>
      supabase
        .from("trip_wineries")
        .update({ visit_order: index + 1 })
        .eq("trip_id", tripId)
        .eq("winery_id", wineryId)
    );
    await Promise.all(updates);
    console.log("Winery order updated successfully.");
    return NextResponse.json({ success: true });
  }

  console.error("Invalid request to PUT /api/trips/[id]");
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}