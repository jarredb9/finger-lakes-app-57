// file: app/api/trips/[id]/route.ts
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
}

interface TripWinery {
  wineries: RawWinery | null;
  visit_order: number;
  notes: string | null;
}

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
    };
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = id;
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

  const allWineryIds = new Set<number>();
  const allMemberIds = new Set<string>();
  if (trip.trip_wineries) {
      trip.trip_wineries.forEach((tw: TripWinery) => tw.wineries?.id && allWineryIds.add(tw.wineries.id));
  }
  if (trip.members) {
      trip.members.forEach((memberId: string) => allMemberIds.add(memberId));
  }
  allMemberIds.add(trip.user_id);

  if (allWineryIds.size === 0 || allMemberIds.size === 0) {
      const formattedTrip = {
        ...trip,
        wineries: trip.trip_wineries
          .sort((a: TripWinery, b: TripWinery) => a.visit_order - b.visit_order)
          .map((tw: TripWinery) => formatWinery(tw.wineries))
          .filter(Boolean),
      };
      return NextResponse.json(formattedTrip);
  }

  const { data: visits, error: visitsError } = await supabase
      .from("visits")
      .select("*, profiles(name)")
      .in("winery_id", Array.from(allWineryIds))
      .in("user_id", Array.from(allMemberIds))
      .eq("visit_date", trip.trip_date);

  if(visitsError) throw visitsError;

  const visitsByWinery = new Map<number, Visit[]>();
  visits?.forEach((visit: any) => {
      if (!visitsByWinery.has(visit.winery_id)) {
          visitsByWinery.set(visit.winery_id, []);
      }
      visitsByWinery.get(visit.winery_id)?.push(visit);
  });

  const wineriesWithVisits = trip.trip_wineries
    .sort((a: TripWinery, b: TripWinery) => a.visit_order - b.visit_order)
    .map((tw: TripWinery) => {
        if (tw.wineries) {
            return {
                id: tw.wineries.google_place_id,
                dbId: tw.wineries.id,
                name: tw.wineries.name,
                address: tw.wineries.address,
                lat: parseFloat(tw.wineries.latitude),
                lng: parseFloat(tw.wineries.longitude),
                phone: tw.wineries.phone,
                website: tw.wineries.website,
                rating: tw.wineries.google_rating,
                notes: tw.notes,
                visits: visitsByWinery.get(tw.wineries.id) || [],
            };
        }
        return null;
    })
    .filter(Boolean);

  const formattedTrip = { ...trip, wineries: wineriesWithVisits };

  return NextResponse.json(formattedTrip);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { id } = await params;
  const tripId = parseInt(id, 10);
  const supabase = await createClient();
  const updates = await request.json();

  // Check if the user is authorized to update this trip
  const { data: existingTrip, error: fetchError } = await supabase
    .from("trips")
    .select("user_id, members")
    .eq("id", tripId)
    .single();

  if (fetchError || !existingTrip) {
    return NextResponse.json({ error: "Trip not found or unauthorized" }, { status: 404 });
  }

  const isOwner = existingTrip.user_id === user.id;
  const isMember = existingTrip.members && existingTrip.members.includes(user.id);

  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Unauthorized to update this trip" }, { status: 403 });
  }

  // Handle general trip updates (name, trip_date, members)
  const tripUpdate: { name?: string; trip_date?: string; members?: string[] } = {};
  if (updates.name !== undefined) tripUpdate.name = updates.name;
  if (updates.trip_date !== undefined) tripUpdate.trip_date = updates.trip_date;
  if (updates.members !== undefined) tripUpdate.members = updates.members;

  if (Object.keys(tripUpdate).length > 0) {
    const { error } = await supabase
      .from("trips")
      .update(tripUpdate)
      .eq("id", tripId);
    if (error) {
      console.error("Error updating trip:", error);
      return NextResponse.json({ error: "Failed to update trip" }, { status: 500 });
    }
  }

  // Handle winery order update
  if (updates.wineryOrder !== undefined && Array.isArray(updates.wineryOrder)) {
    // First, fetch existing notes to preserve them.
    const { data: existingTripWineries, error: notesFetchError } = await supabase
      .from("trip_wineries")
      .select("winery_id, notes")
      .eq("trip_id", tripId);

    if (notesFetchError) {
      console.error("Error fetching existing winery notes:", notesFetchError);
      return NextResponse.json({ error: "Failed to update winery order" }, { status: 500 });
    }

    const notesMap = new Map(existingTripWineries.map(item => [item.winery_id, item.notes]));

    const updatesToPerform = updates.wineryOrder.map((wineryId: number, index: number) => ({
      winery_id: wineryId,
      visit_order: index,
      trip_id: tripId, // tripId is already a number here
      notes: notesMap.get(wineryId) || null, // Preserve existing notes
    }));

    // Delete existing trip_wineries for this trip and re-insert
    const { error: deleteError } = await supabase
      .from("trip_wineries")
      .delete()
      .eq("trip_id", tripId);

    if (deleteError) {
      console.error("Error deleting existing trip_wineries:", deleteError);
      return NextResponse.json({ error: "Failed to update winery order" }, { status: 500 });
    }

    const { error: insertError } = await supabase
      .from("trip_wineries")
      .insert(updatesToPerform);

    if (insertError) {
      console.error("Error inserting new trip_wineries order:", insertError);
      return NextResponse.json({ error: "Failed to update winery order" }, { status: 500 });
    }
  }

  // Handle remove winery from trip
  if (updates.removeWineryId !== undefined) {
    const { error } = await supabase
      .from("trip_wineries")
      .delete()
      .eq("trip_id", tripId)
      .eq("winery_id", updates.removeWineryId);
    if (error) {
      console.error("Error removing winery:", error);
      return NextResponse.json({ error: "Failed to remove winery" }, { status: 500 });
    }
  }

  // Handle update winery note
  if (updates.updateNote !== undefined && updates.updateNote.wineryId !== undefined && updates.updateNote.notes !== undefined) {
    // This handles both single note updates and batch updates
    if (typeof updates.updateNote.notes === 'string') {
      // Single note update
      const { error } = await supabase
        .from("trip_wineries")
        .update({ notes: updates.updateNote.notes })
        .eq("trip_id", tripId)
        .eq("winery_id", updates.updateNote.wineryId);
      if (error) {
        console.error("Error updating winery note:", error);
        return NextResponse.json({ error: "Failed to update winery note" }, { status: 500 });
      }
    } else if (typeof updates.updateNote.notes === 'object') {
      // Batch note update
      const noteUpdates = Object.entries(updates.updateNote.notes).map(([wineryId, noteText]) => 
        supabase
          .from('trip_wineries')
          .update({ notes: noteText as string })
          .eq('trip_id', tripId)
          .eq('winery_id', parseInt(wineryId, 10))
      );
      await Promise.all(noteUpdates);
      // You could add more robust error handling here if needed
    }
  }

  return NextResponse.json({ message: "Trip updated successfully" });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tripId = id;
  const supabase = await createClient();

  // First, verify the user owns the trip
  const { data: trip, error: fetchError } = await supabase
    .from("trips")
    .select("user_id")
    .eq("id", tripId)
    .single();

  if (fetchError || !trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (trip.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete associated trip_wineries first to avoid foreign key constraint violations
  const { error: tripWineriesError } = await supabase
    .from("trip_wineries")
    .delete()
    .eq("trip_id", tripId);

  if (tripWineriesError) {
    console.error("Error deleting trip wineries:", tripWineriesError);
    return NextResponse.json({ error: "Failed to delete associated wineries" }, { status: 500 });
  }

  // Now delete the trip itself
  const { error: deleteError } = await supabase.from("trips").delete().eq("id", tripId);

  if (deleteError) {
    console.error("Error deleting trip:", deleteError);
    return NextResponse.json({ error: "Failed to delete trip" }, { status: 500 });
  }

  return NextResponse.json({ message: "Trip deleted successfully" });
}