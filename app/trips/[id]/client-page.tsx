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
    fetchTripById(tripId);
  }, [fetchTripById, tripId]);

  if (isLoading || !trip) {
    return <Skeleton className="h-96 w-full" />;
  }

                      {user && <TripCard tripId={trip.id} userId={user.id} />}
}