import { createClient } from '@/utils/supabase/client';
import { Trip } from '@/lib/types';

export const TripService = {
  async getTrips(page: number, type: 'upcoming' | 'past', limit = 6) {
    const response = await fetch(`/api/trips?page=${page}&type=${type}&limit=${limit}&full=true`);
    if (!response.ok) {
      throw new Error('Failed to fetch trips');
    }
    return await response.json();
  },

  async getTripById(tripId: string) {
    const response = await fetch(`/api/trips/${tripId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch trip ${tripId}`);
    }
    return await response.json();
  },

  async getUpcomingTrips() {
    const response = await fetch(`/api/trips?type=upcoming&full=true`);
    if (!response.ok) {
      throw new Error('Failed to fetch upcoming trips');
    }
    const data = await response.json();
    return Array.isArray(data.trips) ? data.trips : [];
  },

  async getTripsForDate(dateString: string) {
    const supabase = createClient();
    const formattedDate = new Date(dateString).toISOString().split('T')[0];
    const { data, error } = await supabase.rpc('get_trips_for_date', { target_date: formattedDate });

    if (error) {
      throw new Error(error.message);
    }
    return data || [];
  },

  async createTrip(trip: Partial<Trip>) {
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip)
    });

    if (!response.ok) {
      throw new Error('Failed to create trip on server.');
    }
    return await response.json();
  },

  async deleteTrip(tripId: string) {
    const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error("Failed to delete trip");
    }
  },

  async updateTrip(tripId: string, updates: Partial<Trip> | { removeWineryId: number } | { updateNote: any } | { wineryOrder: number[] }) {
    const response = await fetch(`/api/trips/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to update trip");
    }
  },

  async addWineryToNewTrip(date: string, wineryId: number, notes: string, name: string) {
    const payload = { date, wineryId, notes, name };
    const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create new trip.`);
    }
    return response.json();
  },

  async addWineryToExistingTrip(tripId: number, wineryId: number, notes: string | null) {
    const supabase = createClient();
    const { error } = await supabase.rpc('add_winery_to_trip', {
      trip_id_param: tripId,
      winery_id_param: wineryId,
      notes_param: notes
    });

    if (error) {
      throw new Error(error.message || `Failed to add to trip ${tripId}.`);
    }
    return { success: true };
  },

  async addWineryToTripByApi(wineryId: number, tripIds: number[], date: string) {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wineryId, tripIds, date }),
    });

    if (!response.ok) {
        throw new Error("Failed to add winery to trip.");
    }
    return response.json();
  }
};
