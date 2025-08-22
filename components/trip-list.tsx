"use client";

import { useState, useEffect, useCallback } from 'react';
import { Trip } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '@/components/ui/pagination';

const TRIPS_PER_PAGE = 6;

// A single, reusable card component for displaying a trip.
function TripCard({ trip, onView, onDelete }: { trip: Trip; onView: (date: string) => void; onDelete: (id: number) => void; }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{trip.name || `Trip for ${new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}`}</CardTitle>
                <CardDescription>{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center">
                <Button onClick={() => onView(trip.trip_date)}>
                    View Details <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon"><Trash2 size={16} /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete this trip. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(trip.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}


export default function TripList() {
    const [trips, setTrips] = useState<Trip[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const router = useRouter();
    const { toast } = useToast();

    const fetchTrips = useCallback(async (page: number) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/trips?page=${page}&limit=${TRIPS_PER_PAGE}`);
            if (!response.ok) {
                throw new Error("Failed to fetch trips");
            }
            const data = await response.json();
            if (!data || !Array.isArray(data.trips)) {
                throw new Error("Invalid data format received from API");
            }
            setTrips(data.trips);
            setTotalPages(Math.ceil(data.count / TRIPS_PER_PAGE));
            setCurrentPage(page);
        } catch (error) {
            console.error("Failed to fetch all trips", error);
            setTrips([]); // Set to empty array on error to prevent crash
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTrips(1);
    }, [fetchTrips]);

    const handlePageChange = (page: number) => {
        if (page > 0 && page <= totalPages && page !== currentPage) {
            fetchTrips(page);
        }
    };

    const handleViewTrip = (date: string) => {
        const tripDate = new Date(date).toISOString();
        router.push(`/trips?date=${tripDate}`);
    };

    const handleDeleteTrip = async (tripId: number) => {
        try {
            const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
            if (response.ok) {
                toast({ description: "Trip deleted successfully." });
                fetchTrips(currentPage); // Refresh the current page
            } else {
                toast({ variant: 'destructive', description: "Failed to delete trip." });
            }
        } catch (error) {
            console.error("Failed to delete trip", error);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4">All Trips</h2>
                {trips && trips.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {trips.map(trip => (
                            <TripCard key={trip.id} trip={trip} onView={handleViewTrip} onDelete={handleDeleteTrip} />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">You have no trips recorded.</p>
                )}
            </div>
            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); handlePageChange(currentPage - 1); }} />
                        </PaginationItem>
                        {[...Array(totalPages)].map((_, i) => (
                            <PaginationItem key={i}>
                                <PaginationLink href="#" isActive={currentPage === i + 1} onClick={(e) => { e.preventDefault(); handlePageChange(i + 1); }}>
                                    {i + 1}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
                        <PaginationItem>
                            <PaginationNext href="#" onClick={(e) => { e.preventDefault(); handlePageChange(currentPage + 1); }} />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}