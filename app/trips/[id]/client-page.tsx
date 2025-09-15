'use client'

import { useState, useEffect } from 'react';
import { Trip } from '@/lib/types';
import { User } from '@supabase/supabase-js';
import TripCard from '@/components/trip-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function TripDetailClientPage({ tripId, user }: { tripId: string, user: User }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrip = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/trips/${tripId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch trip details');
        }
        const data = await response.json();
        setTrip(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
  }, [tripId]);

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!trip) {
    return <div>Trip not found.</div>;
  }

  return <TripCard trip={trip} userId={user.id} />;
}
