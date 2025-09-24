'use client'

import { useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore';

export default function TripDetailClientPage({ tripId, user }: { tripId: string, user: User }) {
  console.log('[TripDetailClientPage] Render');

  const fetchTripById = useTripStore(state => state.fetchTripById);
  const isLoading = useTripStore(state => state.isLoading);
  const numericTripId = Number(tripId);
  const trip = useTripStore(state => state.trips.find(t => t.id === numericTripId));

  console.log('[TripDetailClientPage] State:', { isLoading, trip: trip ? { id: trip.id, name: trip.name } : null });

  useEffect(() => {
    console.log('[TripDetailClientPage] useEffect fetchTripById');
    fetchTripById(tripId);
  }, [fetchTripById, tripId]);

  useEffect(() => {
    return () => {
      console.log('[TripDetailClientPage] Unmounting');
    };
  }, []);

  if (isLoading || !trip) {
    console.log('[TripDetailClientPage] Rendering Skeleton');
    return <Skeleton className="h-96 w-full" />;
  }

  console.log('[TripDetailClientPage] Rendering TripCard');
  return <TripCard tripId={trip.id.toString()} userId={user.id} />;
}