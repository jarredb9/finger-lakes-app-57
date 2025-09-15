'use client'

import { useEffect } from 'react'
import { useTripStore } from '@/lib/stores/tripStore'
import TripList from '@/components/trip-list'
import { Skeleton } from '@/components/ui/skeleton'

export default function TripsClientPage() {
  const { trips, fetchAllTrips, isLoading, error } = useTripStore()

  useEffect(() => {
    fetchAllTrips()
  }, [fetchAllTrips])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My Trips</h1>
      <TripList trips={trips} />
    </div>
  )
}
