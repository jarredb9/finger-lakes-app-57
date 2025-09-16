'use client'

import { useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore';

export default function TripDetailClientPage({ tripId, user }: { tripId: string, user: User }) {
  const { trips, fetchAllTrips, isLoading } = useTripStore();
  const trip = trips.find(t => t.id === tripId);

  useEffect(() => {
    if (trips.length === 0 && !isLoading) {
      fetchAllTrips();
    }
  }, [trips.length, isLoading, fetchAllTrips]);

  if (isLoading || !trip) {
    return <Skeleton className="h-96 w-full" />;
  }

  return <TripCard tripId={trip.id} userId={user.id} />;
}
