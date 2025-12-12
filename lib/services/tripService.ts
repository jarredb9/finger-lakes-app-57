import { createClient } from '@/utils/supabase/client';
import { Trip, Winery, Visit } from '@/lib/types';

// Helper types to match DB response structure
interface DbTripWinery {
  visit_order: number;
  notes: string | null;
  wineries: {
    id: number;
    google_place_id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    phone?: string;
    website?: string;
    google_rating?: number;
    opening_hours?: any;
    reviews?: any;
  } | null;
}

export const TripService = {
  async getTrips(page: number, type: 'upcoming' | 'past', limit = 6) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const today = new Date().toISOString().split("T")[0];
    const rangeFrom = (page - 1) * limit;
    const rangeTo = rangeFrom + limit - 1;

    let query = supabase
      .from("trips")
      .select(`
          id,
          name,
          trip_date,
          members,
          trip_wineries (count)
      `, { count: 'exact' })
      .or(`user_id.eq.${user.id},members.cs.{${user.id}}`);

    if (type === 'upcoming') {
      query = query.gte('trip_date', today).order("trip_date", { ascending: true });
    } else {
      query = query.lt('trip_date', today).order("trip_date", { ascending: false });
    }

    const { data: trips, error, count } = await query.range(rangeFrom, rangeTo);

    if (error) throw error;

    // Transform to match expected UI structure
    const formattedTrips = trips?.map((t: any) => ({
      ...t,
      wineries_count: t.trip_wineries?.[0]?.count || 0,
      wineries: [] // List view doesn't need full winery details
    }));

    return { trips: formattedTrips || [], count: count || 0 };
  },

  async getTripById(tripId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Fetch Trip & Wineries
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("*, trip_wineries(*, wineries(*))")
      .eq("id", tripId)
      .single();

    if (tripError || !trip) throw new Error("Trip not found");

    // 2. Fetch Visits (for historical context on the trip planner)
    const allWineryIds = new Set<number>();
    const allMemberIds = new Set<string>();
    
    trip.trip_wineries?.forEach((tw: DbTripWinery) => {
      if (tw.wineries?.id) allWineryIds.add(tw.wineries.id);
    });
    
    trip.members?.forEach((m: string) => allMemberIds.add(m));
    allMemberIds.add(trip.user_id);

    let visitsByWinery = new Map<number, Visit[]>();

    if (allWineryIds.size > 0) {
      const { data: visits } = await supabase
        .from("visits")
        .select("*, profiles(name)")
        .in("winery_id", Array.from(allWineryIds))
        .in("user_id", Array.from(allMemberIds))
        .eq("visit_date", trip.trip_date);

      visits?.forEach((visit: any) => {
        if (!visitsByWinery.has(visit.winery_id)) {
            visitsByWinery.set(visit.winery_id, []);
        }
        visitsByWinery.get(visit.winery_id)?.push(visit);
      });
    }

    // 3. Format Response
    const wineriesWithVisits = trip.trip_wineries
      ?.sort((a: any, b: any) => a.visit_order - b.visit_order)
      .map((tw: DbTripWinery) => {
          if (!tw.wineries) return null;
          return {
              id: tw.wineries.google_place_id,
              dbId: tw.wineries.id,
              name: tw.wineries.name,
              address: tw.wineries.address,
              lat: tw.wineries.latitude,
              lng: tw.wineries.longitude,
              phone: tw.wineries.phone,
              website: tw.wineries.website,
              rating: tw.wineries.google_rating,
              notes: tw.notes,
              visits: visitsByWinery.get(tw.wineries.id) || [],
          };
      })
      .filter(Boolean);

    return { ...trip, wineries: wineriesWithVisits || [] };
  },

  async getUpcomingTrips() {
    // Reuses getTrips logic but simpler
    return (await this.getTrips(1, 'upcoming', 50)).trips; 
  },

  async getTripsForDate(dateString: string) {
    const supabase = createClient();
    const formattedDate = new Date(dateString).toISOString().split('T')[0];
    const { data, error } = await supabase.rpc('get_trips_for_date', { target_date: formattedDate });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async createTrip(trip: Partial<Trip>) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Basic Trip Creation
    const { data: newTrip, error } = await supabase
        .from("trips")
        .insert({ 
            user_id: user.id, 
            trip_date: trip.trip_date, 
            name: trip.name, 
            members: [user.id] 
        })
        .select("*")
        .single();

    if (error) throw error;

    // Handle initial wineries if provided
    if (trip.wineries && trip.wineries.length > 0) {
        const tripWineriesToInsert = trip.wineries.map((w: Winery, index: number) => ({
            trip_id: newTrip.id,
            winery_id: w.dbId,
            visit_order: index,
        }));

        const { error: wError } = await supabase
            .from("trip_wineries")
            .insert(tripWineriesToInsert);
        
        if (wError) console.error("Error adding initial wineries:", wError);
    }

    return { ...newTrip, wineries: trip.wineries || [] } as Trip;
  },

  async deleteTrip(tripId: string) {
    const supabase = createClient();
    // Cascade delete is not set on DB (assumed), so delete relations first
    await supabase.from("trip_wineries").delete().eq("trip_id", tripId);
    
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) throw error;
  },

  async updateTrip(tripId: string, updates: Partial<Trip> | { removeWineryId: number } | { updateNote: any } | { wineryOrder: number[] }) {
    const supabase = createClient();

    // 1. Handle Winery Reordering
    if ('wineryOrder' in updates && Array.isArray(updates.wineryOrder)) {
        // Fetch existing notes to preserve them
        const { data: existingRelations } = await supabase
            .from('trip_wineries')
            .select('winery_id, notes')
            .eq('trip_id', tripId);
            
        const notesMap = new Map(existingRelations?.map(r => [r.winery_id, r.notes]) || []);

        const upsertData = updates.wineryOrder.map((wineryId, index) => ({
            trip_id: parseInt(tripId),
            winery_id: wineryId,
            visit_order: index,
            notes: notesMap.get(wineryId) || null 
        }));

        // Upsert is safer than delete-then-insert
        const { error } = await supabase
            .from('trip_wineries')
            .upsert(upsertData, { onConflict: 'trip_id,winery_id' });
            
        if (error) throw error;
        return;
    }

    // 2. Handle Winery Removal
    if ('removeWineryId' in updates) {
        const { error } = await supabase
            .from("trip_wineries")
            .delete()
            .eq("trip_id", tripId)
            .eq("winery_id", updates.removeWineryId);
        if (error) throw error;
        return;
    }

    // 3. Handle Note Updates
    if ('updateNote' in updates) {
       const { wineryId, notes } = updates.updateNote;
       // Single Update
       if (typeof notes === 'string') {
           const { error } = await supabase
            .from("trip_wineries")
            .update({ notes })
            .eq("trip_id", tripId)
            .eq("winery_id", wineryId);
           if (error) throw error;
       } 
       // Batch Update (Object)
       else if (typeof notes === 'object') {
           const promises = Object.entries(notes).map(([wId, text]) => 
                supabase.from('trip_wineries')
                    .update({ notes: text as string })
                    .eq('trip_id', tripId)
                    .eq('winery_id', wId)
           );
           await Promise.all(promises);
       }
       return;
    }

    // 4. Standard Field Updates (Name, Date, Members)
    const { error } = await supabase
        .from("trips")
        .update(updates)
        .eq("id", tripId);

    if (error) throw error;
  },

  async addWineryToNewTrip(date: string, wineryId: number, notes: string, name: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Create Trip
    const { data: newTrip, error: tripError } = await supabase
        .from("trips")
        .insert({ 
            user_id: user.id, 
            trip_date: date, 
            name: name, 
            members: [user.id] 
        })
        .select("id")
        .single();
    
    if (tripError) throw tripError;

    // 2. Add Winery
    const { error: wError } = await supabase
        .from("trip_wineries")
        .insert({
            trip_id: newTrip.id,
            winery_id: wineryId,
            visit_order: 0,
            notes: notes
        });

    if (wError) throw wError; // Note: Trip exists without winery if this fails. Acceptable for now.
    
    return { success: true, tripId: newTrip.id };
  },

  async addWineryToExistingTrip(tripId: number, wineryId: number, notes: string | null) {
    const supabase = createClient();
    // Get max order
    const { data: existing } = await supabase
        .from("trip_wineries")
        .select('visit_order')
        .eq("trip_id", tripId)
        .order('visit_order', { ascending: false })
        .limit(1)
        .single();
    
    const nextOrder = (existing?.visit_order ?? -1) + 1;

    const { error } = await supabase
      .from('trip_wineries')
      .insert({
          trip_id: tripId,
          winery_id: wineryId,
          visit_order: nextOrder,
          notes: notes
      });

    if (error) throw error;
    return { success: true };
  },

  async addWineryToTripByApi(wineryId: number, tripIds: number[]) {
     // We simply loop and insert. 
     // For a 'New Trip' included in the list, the UI usually calls createTrip separately, 
     // but if tripIds includes IDs, we just add to them.
     
     const promises = tripIds.map(tripId => this.addWineryToExistingTrip(tripId, wineryId, ""));
     await Promise.all(promises);
     
     return { success: true };
  }
};
