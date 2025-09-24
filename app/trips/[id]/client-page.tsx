'use client'

import { useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore';

export default function TripDetailClientPage({ tripId, user }: { tripId: string, user: User }) {
  const fetchTripById = useTripStore(state => state.fetchTripById);
  const isLoading = useTripStore(state => state.isLoading);
  const numericTripId = Number(tripId);
  const trip = useTripStore(state => state.trips.find(t => t.id === numericTripId));

  useEffect(() => {
    // Only fetch the trip if it's not already in the store.
    // This prevents the loading skeleton from appearing on navigation.
    if (!trip) {
      fetchTripById(tripId);
    }
  }, [fetchTripById, tripId, trip]);

  // Show skeleton only if trip is not loaded for the first time.
  if (isLoading && !trip) {
    return <Skeleton className="h-96 w-full" />;
  }

  // If for some reason trip is still not available, show skeleton.
  if (!trip) {
    return <Skeleton className="h-96 w-full" />;
  }

  return <TripCard tripId={trip.id.toString()} userId={user.id} />;
}