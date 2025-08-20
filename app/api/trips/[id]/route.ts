import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tripId = parseInt(params.id, 10);
  const { removeWineryId, wineryOrder, name, updateNote } = await request.json();
  const supabase = await createClient();

  // Handle updating trip name
  if (name) {
    const { error } = await supabase.from("trips").update({ name }).eq("id", tripId).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  }

  // Handle removing a winery
  if (removeWineryId) {
    const { error } = await supabase.from("trip_wineries").delete().eq("trip_id", tripId).eq("winery_id", removeWineryId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  }

  // Handle reordering wineries
  if (wineryOrder) {
    const updates = wineryOrder.map((wineryId: number, index: number) =>
      supabase.from("trip_wineries").update({ visit_order: index + 1 }).eq("trip_id", tripId).eq("winery_id", wineryId)
    );
    await Promise.all(updates);
    return NextResponse.json({ success: true });
  }

  // Handle updating a note for a winery in a trip
  if (updateNote && updateNote.wineryId && typeof updateNote.notes === 'string') {
    const { error } = await supabase
      .from("trip_wineries")
      .update({ notes: updateNote.notes })
      .eq("trip_id", tripId)
      .eq("winery_id", updateNote.wineryId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tripId = parseInt(params.id, 10);
    if (isNaN(tripId)) return NextResponse.json({ error: "Invalid trip ID" }, { status: 400 });

    const supabase = await createClient();
    const { error } = await supabase.from("trips").delete().eq("id", tripId).eq("user_id", user.id);
    if (error) {
      console.error("Error deleting trip:", error);
      return NextResponse.json({ error: "Failed to delete trip" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}