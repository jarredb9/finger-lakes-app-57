import { createClient } from '@/utils/supabase/client';
import { Trip } from '@/lib/types';
import { getTodayLocal, formatDateLocal } from '@/lib/utils';
import { WineryService } from './wineryService';

export const TripService = {
  async getTrips(page: number, type: 'upcoming' | 'past', limit = 6) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const today = getTodayLocal();
    const rangeFrom = (page - 1) * limit;
    const rangeTo = rangeFrom + limit - 1;

    // We use a subquery to filter by membership in trip_members OR being the owner
    let query = supabase
      .from("trips")
      .select(`
          id,
          user_id,
          name,
          trip_date,
          trip_wineries (count),
          trip_members!inner (user_id)
      `, { count: 'exact' })
      .eq('trip_members.user_id', user.id);

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
      wineries: [], // List view doesn't need full winery details
      members: [] // List view usually doesn't need full member details either
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
    // Standardize to local YYYY-MM-DD
    const formattedDate = formatDateLocal(new Date(dateString + 'T00:00:00'));
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
            p_winery_data: WineryService.getRpcData(w),
            p_members: []
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

    // Fallback for trip without wineries (Use RPC for robustness)
    const { data, error } = await supabase.rpc('create_trip', {
        p_name: trip.name || 'New Trip',
        p_trip_date: trip.trip_date
    });

    if (error) throw error;

    return this.getTripById(data.id.toString());
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

    // 4. Standard Field Updates (Name, Date)
    // Filter out members if it accidentally slipped in (as it will be removed from DB)
    const { members, ...otherUpdates } = updates as any;
    
    if (Object.keys(otherUpdates).length > 0) {
        const { error } = await supabase
            .from("trips")
            .update(otherUpdates)
            .eq("id", tripId);

        if (error) throw error;
    }
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

  async removeMember(tripId: number, userId: string) {
    const supabase = createClient();
    const { error } = await supabase
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .neq('role', 'owner'); // Safety: cannot remove owner

    if (error) {
        console.error("Error removing member:", error);
        throw new Error(error.message || "Failed to remove member.");
    }

    return { success: true };
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
        p_winery_data: WineryService.getRpcData(winery),
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
        p_winery_data: WineryService.getRpcData(winery),
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
