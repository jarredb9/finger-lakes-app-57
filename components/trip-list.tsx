"use client";

import { useState, useEffect } from 'react';
import { useTripStore } from '@/lib/stores/tripStore';
import { Trip, AuthenticatedUser } from '@/lib/types';
import { Button } from './ui/button';
import { Loader2, PlusCircle } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import TripCardSimple from './trip-card-simple';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import TripForm from "./trip-form";

export default function TripList({ user }: { user: AuthenticatedUser }) {
    const { trips, isLoading, page, hasMore, fetchTrips, setPage, deleteTrip } = useTripStore();
    const [tripType, setTripType] = useState<'upcoming' | 'past'>('upcoming');
    const [isCreateTripModalOpen, setCreateTripModalOpen] = useState(false);
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

    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    
    const todaysTrips = tripType === 'upcoming' ? trips.filter(t => t.trip_date === today) : [];
    const otherTrips = tripType === 'upcoming' ? trips.filter(t => t.trip_date !== today) : trips;

    if (isLoading && trips.length === 0) {
        return <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold">{tripType === 'upcoming' ? 'My Trips' : 'Past Trips'}</h2>
                    {tripType === 'upcoming' && (
                        <Dialog open={isCreateTripModalOpen} onOpenChange={setCreateTripModalOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> New Trip</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Create a New Trip</DialogTitle>
                                </DialogHeader>
                                <TripForm user={user} initialDate={new Date()} />
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
                <Button variant="outline" onClick={() => setTripType(tripType === 'upcoming' ? 'past' : 'upcoming')}>
                    View {tripType === 'upcoming' ? 'Past' : 'Upcoming'} Trips
                </Button>
            </div>

            {tripType === 'upcoming' && todaysTrips.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-primary">Happening Today</h3>
                    <div className="grid gap-4 w-full">
                        {todaysTrips.map((trip: Trip) => (
                            <TripCardSimple key={trip.id} trip={trip} onDelete={handleDeleteTrip} />
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-4">
                 {tripType === 'upcoming' && <h3 className="text-xl font-semibold">Upcoming</h3>}
                 {otherTrips.length > 0 ? (
                    <div className="grid gap-4 w-full">
                        {otherTrips.map((trip: Trip) => (
                            <TripCardSimple key={trip.id} trip={trip} onDelete={handleDeleteTrip} />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        {tripType === 'upcoming' && todaysTrips.length === 0 
                            ? "You have no upcoming trips." 
                            : tripType === 'past' 
                                ? "You have no past trips." 
                                : "No other upcoming trips."}
                    </p>
                )}
            </div>

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
