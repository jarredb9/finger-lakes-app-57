'use client'

import { useEffect } from 'react';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore';

export default function TripDetailClientPage({ tripId }: { tripId: string }) {
  const fetchTripById = useTripStore(state => state.fetchTripById);
  const setSelectedTrip = useTripStore(state => state.setSelectedTrip);
  const isLoading = useTripStore(state => state.isLoading);
  const numericTripId = Number(tripId);
  const trip = useTripStore(state => state.trips.find(t => t.id === numericTripId));

  useEffect(() => {
    // Clear selected trip on mount so it doesn't persist as "active" on the map
    setSelectedTrip(null);
    fetchTripById(tripId);
    return () => setSelectedTrip(null);
  }, [fetchTripById, setSelectedTrip, tripId]);

  if (isLoading || !trip) {
    return <Skeleton className="h-96 w-full" />;
  }

  return <TripCard trip={trip} />;
}