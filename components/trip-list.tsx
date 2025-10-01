"use client";

import { useState, useEffect, useCallback } from 'react';
import { useTripStore } from '@/lib/stores/tripStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import TripCard from './trip-card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '@/components/ui/pagination';

export default function TripList() {
    const { trips, isLoading, page, hasMore, fetchTrips, setPage } = useTripStore();
    const { wineries } = useWineryStore();
    const [tripType, setTripType] = useState<'upcoming' | 'past'>('upcoming');

    useEffect(() => {
        fetchTrips(page, 'trip_date', 'desc', tripType, true);
    }, [fetchTrips, tripType, page]);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
    };

    if (isLoading && trips.length === 0) {
        return <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">{tripType === 'upcoming' ? 'Upcoming Trips' : 'Past Trips'}</h2>
                <Button variant="default" onClick={() => setTripType(tripType === 'upcoming' ? 'past' : 'upcoming')}>
                    View {tripType === 'upcoming' ? 'Past' : 'Upcoming'} Trips
                </Button>
            </div>
            {trips.length > 0 ? (
                <div className="space-y-4">
                    {trips.map(trip => (
                        <TripCard key={trip.id} trip={trip} allWineries={wineries} />
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground">You have no {tripType} trips.</p>
            )}
            {hasMore && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); handlePageChange(page - 1); }} /></PaginationItem>
                        <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); handlePageChange(page + 1); }} /></PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}
