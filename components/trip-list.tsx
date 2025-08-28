// file: components/trip-list.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Trip } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2, Wine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

const TRIPS_PER_PAGE = 6;

// Refactored TripList component to accept a 'type' prop
export default function TripList({ type }: { type: 'upcoming' | 'past'; }) {
    const [trips, setTrips] = useState<Trip[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const router = useRouter();
    const { toast } = useToast();
    
    // This state is used to force a re-fetch if a trip is deleted on the same page
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchTrips = useCallback(async (page: number) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/trips?type=${type}&page=${page}&limit=${TRIPS_PER_PAGE}`);
            if (response.ok) {
                const { trips, count } = await response.json();
                setTrips(trips);
                setTotalPages(Math.ceil(count / TRIPS_PER_PAGE));
                setCurrentPage(page);
            }
        } catch (error) {
            console.error(`Failed to fetch ${type} trips`, error);
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        fetchTrips(currentPage);
    }, [fetchTrips, currentPage, refreshKey]);

    const handlePageChange = (page: number) => {
        if (page > 0 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const handleViewTrip = (date: string) => {
        router.push(`/trips?date=${new Date(date + 'T00:00:00').toISOString()}`);
    };

    const handleDeleteTrip = async (tripId: number) => {
        try {
            const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
            if (response.ok) {
                toast({ description: "Trip deleted successfully." });
                setRefreshKey(prev => prev + 1); // Increment key to force a re-fetch
            } else {
                toast({ variant: 'destructive', description: "Failed to delete trip." });
            }
        } catch (error) {
            console.error("Failed to delete trip", error);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    if (!trips || trips.length === 0) {
        return (
            <p className="text-muted-foreground">You have no {type} trips.</p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trips.map(trip => (
                    <Card key={trip.id}>
                        <CardHeader className="relative">
                            <CardTitle className="text-lg">{trip.name || `Trip for ${new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}`}</CardTitle>
                            <CardDescription>{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</CardDescription>
                            <Badge variant="secondary" className="absolute top-4 right-4"><Wine className="w-3 h-3 mr-1" /> {trip.wineries_count} Wineries</Badge>
                        </CardHeader>
                        <CardContent className="flex justify-between items-center">
                            <Button onClick={() => handleViewTrip(trip.trip_date)}>View Details <ArrowRight className="ml-2 h-4 w-4" /></Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="icon"><Trash2 size={16} /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This action will permanently delete this trip.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteTrip(trip.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); handlePageChange(currentPage - 1); }} /></PaginationItem>
                        {[...Array(totalPages)].map((_, i) => (<PaginationItem key={i}><PaginationLink href="#" isActive={currentPage === i + 1} onClick={(e) => { e.preventDefault(); handlePageChange(i + 1); }}>{i + 1}</PaginationLink></PaginationItem>))}
                        <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); handlePageChange(currentPage + 1); }} /></PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}