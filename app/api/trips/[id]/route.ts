import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tripId = parseInt(params.id, 10);
    if (isNaN(tripId)) {
        return NextResponse.json({ error: "Invalid trip ID" }, { status: 400 });
    }

    try {
        const supabase = await createClient();

        const { data: trip, error: tripError } = await supabase
            .from('trips')
            .select(`
                id,
                name,
                trip_date,
                user_id,
                members,
                trip_wineries (
                    winery_id,
                    visit_order,
                    notes,
                    wineries (
                        id,
                        name,
                        latitude,
                        longitude
                    )
                )
            `)
            .eq('id', tripId)
            .or(`user_id.eq.${user.id},members.cs.{${user.id}}`)
            .single();

        if (tripError) {
            console.error(`Error fetching trip ${tripId}:`, tripError);
            throw tripError;
        }

        if (!trip) {
            return NextResponse.json({ error: "Trip not found or you don't have permission to view it." }, { status: 404 });
        }
        
        // Sort the wineries by visit_order
        if (trip.trip_wineries) {
            trip.trip_wineries.sort((a, b) => a.visit_order - b.visit_order);
        }

        return NextResponse.json(trip);

    } catch (error) {
        console.error(`Error fetching trip ${tripId}:`, error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// Handles various updates to a trip like changing its name, reordering wineries, removing a winery, or updating a note.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tripId = parseInt(params.id, 10);
    if (isNaN(tripId)) {
        return NextResponse.json({ error: "Invalid trip ID" }, { status: 400 });
    }

    try {
        const body = await request.json();
        const supabase = await createClient();

        // Verify the user owns the trip first
        const { data: trip, error: ownerError } = await supabase
            .from('trips')
            .select('id, members')
            .eq('id', tripId)
            .or(`user_id.eq.${user.id},members.cs.{${user.id}}`)
            .single();

        if (ownerError || !trip) {
            return NextResponse.json({ error: "Trip not found or you don't have permission to edit it." }, { status: 404 });
        }

        // Scenario 1: Update trip name
        if (body.name) {
            const { error } = await supabase.from('trips').update({ name: body.name }).eq('id', tripId);
            if (error) throw error;
        }
        
        // Scenario 1a: Update trip date
        if (body.trip_date) {
            const { error } = await supabase.from('trips').update({ trip_date: body.trip_date }).eq('id', tripId);
            if (error) throw error;
        }

        // Scenario 2: Remove a winery from the trip
        if (body.removeWineryId) {
            const { error } = await supabase.from('trip_wineries').delete().eq('trip_id', tripId).eq('winery_id', body.removeWineryId);
            if (error) throw error;
        }
        
        // Scenario 3: Update the order of wineries in the trip
.DS_Store
        if (body.wineryOrder && Array.isArray(body.wineryOrder)) {
            const updates = body.wineryOrder.map((wineryId, index) => 
                supabase.from('trip_wineries')
                        .update({ visit_order: index + 1 })
                        .eq('trip_id', tripId)
                        .eq('winery_id', wineryId)
            );
            await Promise.all(updates);
        }

        // Scenario 4: Update a note for a specific winery in the trip
        if (body.updateNote) {
            const { wineryId, notes } = body.updateNote;
            const { error } = await supabase.from('trip_wineries')
                .update({ notes: notes })
                .eq('trip_id', tripId)
                .eq('winery_id', wineryId);
            if (error) throw error;
        }

        // Scenario 5: Update trip members
        if (body.members) {
            const { error } = await supabase.from('trips').update({ members: body.members }).eq('id', tripId);
            if (error) throw error;
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error(`Error updating trip ${tripId}:`, error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// Handles deleting an entire trip
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tripId = params.id;
    const supabase = await createClient();

    // The trip and all associated trip_wineries will be deleted due to CASCADE constraint
    const { error } = await supabase.from("trips").delete().eq("id", tripId).eq("user_id", user.id);

    if (error) {
      console.error(`Error deleting trip ${tripId}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Internal error during trip deletion:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}