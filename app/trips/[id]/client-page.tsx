'use client'

import { useEffect } from 'react';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore';
import { useWineryStore } from '@/lib/stores/wineryStore';

export default function TripDetailClientPage({ tripId }: { tripId: string }) {
  const fetchTripById = useTripStore(state => state.fetchTripById);
  const isLoading = useTripStore(state => state.isLoading);
  const numericTripId = Number(tripId);
  const trip = useTripStore(state => state.trips.find(t => t.id === numericTripId));
  const { fetchWineryData, persistentWineries: allWineries } = useWineryStore();

  useEffect(() => {
    fetchTripById(tripId);
    fetchWineryData();
  }, [fetchTripById, tripId, fetchWineryData]);

  if (isLoading || !trip) {
    return <Skeleton className="h-96 w-full" />;
  }

  return <TripCard trip={trip} allWineries={allWineries} />;
}