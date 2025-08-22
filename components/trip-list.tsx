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

export default function TripList() {
    const [allTrips, setAllTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const router = useRouter();
    const { toast } = useToast();

    const fetchAllTrips = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/trips?page=${page}&limit=${TRIPS_PER_PAGE}`);
            if (response.ok) {
                const { trips, count } = await response.json();
                console.log("[TripList] Fetched data:", { trips, count });
                setAllTrips(trips || []); // Ensure we always set an array
                setTotalPages(Math.ceil(count / TRIPS_PER_PAGE));
                setCurrentPage(page);
            } else {
                 console.error("[TripList] Failed to fetch trips, response not ok.");
                 setAllTrips([]);
            }
        } catch (error) {
            console.error("Failed to fetch all trips", error);
            setAllTrips([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllTrips(1);
    }, [fetchAllTrips]);
    
    // ADDED LOGGING HERE
    console.log("[TripList] Rendering with allTrips state:", allTrips, `Is it an array? ${Array.isArray(allTrips)}`);
    if (!Array.isArray(allTrips)) {
        console.error("[TripList] CRITICAL: `allTrips` is not an array during render. Value:", allTrips);
    }


    const handlePageChange = (page: number) => {
        if (page > 0 && page <= totalPages && page !== currentPage) {
            fetchAllTrips(page);
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
                fetchAllTrips(currentPage);
            } else {
                toast({ variant: 'destructive', description: "Failed to delete trip." });
            }
        } catch (error) {
            console.error("Failed to delete trip", error);
        }
    };
    
    const renderTripCard = (trip: Trip) => (
        <Card key={trip.id}>
            <CardHeader>
                <CardTitle>{trip.name || `Trip for ${new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}`}</CardTitle>
                <CardDescription>{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center">
                <Button onClick={() => handleViewTrip(trip.trip_date)}>
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
                            <AlertDialogAction onClick={() => handleDeleteTrip(trip.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );

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
                {(allTrips && allTrips.length > 0) ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {allTrips.map(renderTripCard)}
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