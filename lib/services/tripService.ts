import { createClient } from '@/utils/supabase/client';
import { Trip } from '@/lib/types';

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
    
    const { data, error } = await supabase.rpc('get_trip_details', { 
      trip_id_param: parseInt(tripId) 
    });

    if (error) {
      console.error("Error fetching trip details:", error);
      throw new Error(error.message || "Trip not found");
    }

    return data as Trip;
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
    
    // Note: The RPC 'create_trip_with_winery' handles one winery at a time.
    // If multiple wineries are provided (rare in our current UI flow for NEW trips), 
    // we take the first one or just create the trip normally if empty.
    
    if (trip.wineries && trip.wineries.length > 0) {
        const w = trip.wineries[0];
        const { data, error } = await supabase.rpc('create_trip_with_winery', {
            p_trip_name: trip.name || 'New Trip',
            p_trip_date: trip.trip_date,
            p_winery_data: {
                id: w.id,
                name: w.name,
                address: w.address,
                lat: w.lat,
                lng: w.lng,
                phone: w.phone,
                website: w.website,
                rating: w.rating
            },
            p_members: trip.members || null
        });

        if (error) throw error;
        
        // If there were more wineries, add them to the existing trip
        if (trip.wineries.length > 1) {
            const extraWineries = trip.wineries.slice(1);
            for (const extra of extraWineries) {
                await this.addWineryToExistingTrip(data.trip_id, extra.dbId || 0, null);
            }
        }

        return this.getTripById(data.trip_id.toString());
    }

    // Fallback for trip without wineries (Basic Insert)
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newTrip, error } = await supabase
        .from("trips")
        .insert({ 
            user_id: user?.id, 
            trip_date: trip.trip_date, 
            name: trip.name, 
            members: [user?.id] 
        })
        .select("*")
        .single();

    if (error) throw error;
    return { ...newTrip, wineries: [] } as Trip;
  },

  async deleteTrip(tripId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('delete_trip', { p_trip_id: parseInt(tripId) });
    if (error) throw error;
  },

  async updateTrip(tripId: string, updates: Partial<Trip> | { removeWineryId: number } | { updateNote: any } | { wineryOrder: number[] }) {
    const supabase = createClient();

    // 1. Handle Winery Reordering
    if ('wineryOrder' in updates && Array.isArray(updates.wineryOrder)) {
        const { error } = await supabase.rpc('reorder_trip_wineries', {
            p_trip_id: parseInt(tripId),
            p_winery_ids: updates.wineryOrder
        });
            
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
       
       if (typeof notes === 'string') {
           const { error } = await supabase.rpc('update_trip_winery_notes', {
               p_trip_id: parseInt(tripId),
               p_winery_id: wineryId,
               p_notes: notes
           });
           if (error) throw error;
       } 
       else if (typeof notes === 'object') {
           const promises = Object.entries(notes).map(([wId, text]) => 
                supabase.rpc('update_trip_winery_notes', {
                    p_trip_id: parseInt(tripId),
                    p_winery_id: parseInt(wId),
                    p_notes: text as string
                })
           );
           const results = await Promise.all(promises);
           const firstError = results.find(r => r.error)?.error;
           if (firstError) throw firstError;
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

  async addMemberByEmail(tripId: number, email: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('add_trip_member_by_email', {
        p_trip_id: tripId,
        p_email: email
    });

    if (error) {
        console.error("Error adding member by email:", error);
        throw new Error(error.message || "Failed to add member.");
    }

    return data;
  },

  async addWineryToNewTrip(date: string, wineryId: number, notes: string, name: string) {
    const supabase = createClient();
    const dataStore = (window as any).useWineryDataStore?.getState();
    const winery = dataStore?.persistentWineries.find((w: any) => w.dbId === wineryId);

    if (!winery) {
        throw new Error("Winery data not found in local store for creation.");
    }

    const { data, error } = await supabase.rpc('create_trip_with_winery', {
        p_trip_name: name,
        p_trip_date: date,
        p_winery_data: {
            id: winery.id,
            name: winery.name,
            address: winery.address,
            lat: winery.lat,
            lng: winery.lng,
            phone: winery.phone,
            website: winery.website,
            rating: winery.rating
        },
        p_notes: notes
    });

    if (error) throw error;
    return { success: true, tripId: data.trip_id };
  },

  async addWineryToExistingTrip(tripId: number, wineryId: number, notes: string | null) {
    const supabase = createClient();
    const dataStore = (window as any).useWineryDataStore?.getState();
    const winery = dataStore?.persistentWineries.find((w: any) => w.dbId === wineryId);

    if (!winery) {
        // If not in store, we might just have the ID. 
        // We can't use add_winery_to_trip RPC if it requires full winery data.
        // Let's check the RPC signature for add_winery_to_trip.
        // Actually, we have two: 
        // 1. add_winery_to_trip(integer, integer, text) -> 20251201000005
        // 2. add_winery_to_trip(integer, jsonb, text) -> 20251209000000
        
        // We should use the simple ID one if we only have wineryId.
        const { error } = await supabase.rpc('add_winery_to_trip', {
            trip_id_param: tripId,
            winery_id_param: wineryId,
            notes_param: notes
        });
        if (error) throw error;
        return { success: true };
    }

    const { error } = await supabase.rpc('add_winery_to_trip', {
        p_trip_id: tripId,
        p_winery_data: {
            id: winery.id,
            name: winery.name,
            address: winery.address,
            lat: winery.lat,
            lng: winery.lng,
            phone: winery.phone,
            website: winery.website,
            rating: winery.rating
        },
        p_notes: notes
    });

    if (error) throw error;
    return { success: true };
  },

  async addWineryToTripByApi(wineryId: number, tripIds: number[]) {
     const supabase = createClient();
     const { error } = await supabase.rpc('add_winery_to_trips', {
         p_winery_id: wineryId,
         p_trip_ids: tripIds
     });
     
     if (error) throw error;
     return { success: true };
  }
};
