"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trip } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function TripList() {
    const [allTrips, setAllTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();

    const fetchAllTrips = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/trips');
            if (response.ok) {
                const data = await response.json();
                setAllTrips(data);
            }
        } catch (error) {
            console.error("Failed to fetch all trips", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllTrips();
    }, [fetchAllTrips]);

    const { pastTrips, upcomingTrips } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today's date

        return allTrips.reduce((acc, trip) => {
            // Ensure date is parsed correctly, especially on the client
            const tripDate = new Date(trip.trip_date + 'T00:00:00'); 
            if (tripDate < today) {
                acc.pastTrips.push(trip);
            } else {
                acc.upcomingTrips.push(trip);
            }
            return acc;
        }, { pastTrips: [] as Trip[], upcomingTrips: [] as Trip[] });
    }, [allTrips]);

    const handleViewTrip = (date: string) => {
        const tripDate = new Date(date).toISOString();
        router.push(`/trips?date=${tripDate}`);
    };

    const handleDeleteTrip = async (tripId: number) => {
        try {
            const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
            if (response.ok) {
                toast({ description: "Trip deleted successfully." });
                fetchAllTrips(); // Refresh the list
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
            <div>
                <h2 className="text-2xl font-bold mb-4">Upcoming Trips</h2>
                {upcomingTrips.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {upcomingTrips.map(renderTripCard)}
                    </div>
                ) : (
                    <p className="text-muted-foreground">You have no upcoming trips planned.</p>
                )}
            </div>
            <div>
                <h2 className="text-2xl font-bold mb-4">Past Trips</h2>
                {pastTrips.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {pastTrips.map(renderTripCard)}
                    </div>
                ) : (
                    <p className="text-muted-foreground">You have no past trips recorded.</p>
                )}
            </div>
        </div>
    );
}