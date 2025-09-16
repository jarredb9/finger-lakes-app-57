'use client'

import { useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore'; // Corrected import path

export default function TripDetailClientPage({ tripId, user }: { tripId: string, user: User }) {
  const fetchAllTrips = useTripStore(state => state.fetchAllTrips);
  const isLoading = useTripStore(state => state.isLoading);
  const numericTripId = Number(tripId); // Convert tripId to number
  const trip = useTripStore(state => state.trips.find(t => t.id === numericTripId));

  console.log("[TripDetailClientPage] Received tripId:", tripId, "(type:", typeof tripId, ")");
  console.log("[TripDetailClientPage] Converted numericTripId:", numericTripId, "(type:", typeof numericTripId, ")");
  if (trip) {
    console.log("[TripDetailClientPage] Found trip ID:", trip.id, "(type:", typeof trip.id, ")");
  }

  useEffect(() => {
    console.log("[TripDetailClientPage] Initializing fetchAllTrips");
    fetchAllTrips();
  }, [fetchAllTrips]);

  if (isLoading || !trip) {
    console.log("[TripDetailClientPage] Loading or trip not found. isLoading:", isLoading, "trip:", trip);
    return <Skeleton className="h-96 w-full" />;
  }

  return <TripCard tripId={trip.id} userId={user.id} />;
}

