"use client";

import { useState } from 'react';
import { Trip, AuthenticatedUser } from '@/lib/types';
import { Button } from './ui/button';
import { PlusCircle, AlertTriangle } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';
import TripCardSimple from './trip-card-simple';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import TripForm from "./trip-form";
import { Alert, AlertDescription } from './ui/alert';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle 
} from "@/components/ui/alert-dialog";

interface TripListProps {
    user: AuthenticatedUser;
    trips: Trip[];
    isLoading: boolean;
    error: string | null;
    page: number;
    hasMore: boolean;
    tripType: 'upcoming' | 'past';
    onTripTypeChange: (type: 'upcoming' | 'past') => void;
    onPageChange: (page: number) => void;
    onDeleteTrip: (tripId: number) => void;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;
    tripToDelete: number | null;
    onExploreClick?: () => void;
    today: string;
}

export default function TripList({ 
    user, 
    trips, 
    isLoading, 
    error, 
    page, 
    hasMore, 
    tripType,
    onTripTypeChange,
    onPageChange,
    onDeleteTrip,
    onConfirmDelete,
    onCancelDelete,
    tripToDelete,
    onExploreClick,
    today
}: TripListProps) {
    const [isCreateTripModalOpen, setCreateTripModalOpen] = useState(false);

    const handlePageChange = (newPage: number) => {
        if (newPage > 0) {
            onPageChange(newPage);
        }
    };

    const todaysTrips = tripType === 'upcoming' ? trips.filter(t => t.trip_date === today) : [];
    const otherTrips = tripType === 'upcoming' 
        ? trips.filter(t => t.trip_date > today) 
        : trips.filter(t => t.trip_date < today);

    return (
        <div className="space-y-8 pb-4" data-testid="trip-list-container" data-state={error ? 'error' : isLoading && trips.length === 0 ? 'loading' : 'ready'}>
            {error ? (
                <Alert variant="destructive" className="my-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : isLoading && trips.length === 0 ? (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                         <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                         <div className="h-9 w-24 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 w-full bg-muted animate-pulse rounded-xl" />
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between gap-4">
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
                                        <TripForm 
                                            user={user} 
                                            initialDate={new Date()} 
                                            onClose={() => setCreateTripModalOpen(false)}
                                        />
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    </div>

                    {tripType === 'upcoming' && todaysTrips.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-primary">Happening Today</h3>
                            <div className="grid gap-4 w-full">
                                {todaysTrips.map((trip: Trip) => (
                                    <TripCardSimple key={trip.id} trip={trip} onDelete={onDeleteTrip} />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                         {tripType === 'upcoming' && <h3 className="text-xl font-semibold">Upcoming</h3>}
                         {otherTrips.length > 0 ? (
                            <div className="grid gap-4 w-full">
                                {otherTrips.map((trip: Trip) => (
                                    <TripCardSimple key={trip.id} trip={trip} onDelete={onDeleteTrip} />
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                                <p className="text-muted-foreground">
                                    {tripType === 'upcoming' && todaysTrips.length === 0 
                                        ? "You have no upcoming trips." 
                                        : tripType === 'past' 
                                            ? "You have no past trips." 
                                            : "No other upcoming trips."}
                                </p>
                                {tripType === 'upcoming' && todaysTrips.length === 0 && onExploreClick && (
                                    <Button variant="outline" size="sm" onClick={onExploreClick}>
                                        Browse Wineries to Plan a Trip
                                    </Button>
                                )}
                            </div>
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

                    <Button 
                        variant="outline" 
                        className="w-full mt-4" 
                        onClick={() => onTripTypeChange(tripType === 'upcoming' ? 'past' : 'upcoming')}
                    >
                        View {tripType === 'upcoming' ? 'Past' : 'Upcoming'} Trips
                    </Button>

                    <AlertDialog open={tripToDelete !== null} onOpenChange={(open) => !open && onCancelDelete()}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>This action will permanently delete this trip.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={onCancelDelete}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={onConfirmDelete} data-testid="confirm-delete-trip-btn">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    );
}
