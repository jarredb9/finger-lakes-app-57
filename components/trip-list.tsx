"use client";

import { useState, useEffect } from 'react';
import { useTripStore } from '@/lib/stores/tripStore';
import { Trip } from '@/lib/types';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import TripCardSimple from './trip-card-simple';

export default function TripList() {
    const { trips, isLoading, page, hasMore, fetchTrips, setPage, deleteTrip } = useTripStore();
    const [tripType, setTripType] = useState<'upcoming' | 'past'>('upcoming');
    const { toast } = useToast();

    useEffect(() => {
        fetchTrips(1, tripType, true);
    }, [fetchTrips, tripType]);

    const handlePageChange = (newPage: number) => {
        if (newPage > 0) {
            setPage(newPage);
            fetchTrips(newPage, tripType);
        }
    };

    const handleDeleteTrip = async (tripId: number) => {
        try {
            await deleteTrip(tripId.toString());
            toast({ description: "Trip deleted successfully." });
            fetchTrips(1, tripType, true);
        } catch (error) {
            toast({ variant: 'destructive', description: "Failed to delete trip." });
        }
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 w-full">
                    {trips.map((trip: Trip) => (
                        <TripCardSimple key={trip.id} trip={trip} onDelete={handleDeleteTrip} />
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
