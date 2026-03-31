'use client'

import { useEffect } from 'react';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripStore } from '@/lib/stores/tripStore';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function TripDetailClientPage({ tripId }: { tripId: string }) {
  const fetchTripById = useTripStore(state => state.fetchTripById);
  const setSelectedTrip = useTripStore(state => state.setSelectedTrip);
  const isLoading = useTripStore(state => state.isLoading);
  const error = useTripStore(state => state.error);
  const numericTripId = Number(tripId);
  const trip = useTripStore(state => state.trips.find(t => Number(t.id) === numericTripId));

  useEffect(() => {
    // Clear selected trip on mount so it doesn't persist as "active" on the map
    setSelectedTrip(null);
    fetchTripById(tripId);
    return () => setSelectedTrip(null);
  }, [fetchTripById, setSelectedTrip, tripId]);

  if (isLoading && !trip) {
    return <Skeleton className="h-96 w-full" data-testid="trip-details-skeleton" />;
  }

  if (error && !trip) {
    return (
      <div className="p-4 space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Trip</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link href="/trips">
          <Button variant="outline">Back to Trips</Button>
        </Link>
      </div>
    );
  }

  if (!isLoading && !trip) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <div className="bg-muted p-4 rounded-full">
          <MapPin className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Trip Not Found</h2>
        <p className="text-muted-foreground">The trip you are looking for does not exist or you do not have permission to view it.</p>
        <Link href="/trips">
          <Button>View My Trips</Button>
        </Link>
      </div>
    );
  }

  if (!trip) return null;

  return <TripCard trip={trip} />;
}