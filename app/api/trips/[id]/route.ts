import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tripId = parseInt(params.id, 10);
  const { removeWineryId, wineryOrder } = await request.json();
  const supabase = await createClient();

  if (removeWineryId) {
    const { error } = await supabase
      .from("trip_wineries")
      .delete()
      .eq("trip_id", tripId)
      .eq("winery_id", removeWineryId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  }

  if (wineryOrder) {
    const updates = wineryOrder.map((wineryId: number, index: number) =>
      supabase
        .from("trip_wineries")
        .update({ visit_order: index + 1 })
        .eq("trip_id", tripId)
        .eq("winery_id", wineryId)
    );
    await Promise.all(updates);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}