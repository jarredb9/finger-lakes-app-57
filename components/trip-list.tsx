"use client";

import { useState, useEffect } from 'react';
import { useTripStore } from '@/lib/stores/tripStore';
import { Trip, Winery } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from './ui/button';
import { Loader2, ArrowRight, Trash2, Wine, Share2 } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function TripList() {
    const { trips, isLoading, page, hasMore, fetchTrips, setPage, deleteTrip } = useTripStore();
    const [tripType, setTripType] = useState<'upcoming' | 'past'>('upcoming');
    const router = useRouter();
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

    const handleViewTrip = (tripId: number) => {
        router.push(`/trips/${tripId}`);
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

    const handleExportToMaps = (tripWineries: Winery[]) => {
        if (!tripWineries || tripWineries.length === 0) {
            return;
        }

        const encodedWineries = tripWineries.map(w => encodeURIComponent(`${w.name}, ${w.address}`));
        
        let url = `https://www.google.com/maps/dir/Current+Location/`;

        if (encodedWineries.length === 1) {
            url += `${encodedWineries[0]}`;
        } else {
            const waypoints = encodedWineries.join('/');
            url += `${waypoints}`;
        }
        
        window.open(url, '_blank');
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {trips.map((trip: Trip) => (
                        <Card key={trip.id}>
                            <CardHeader className="relative">
                                <CardTitle className="text-lg">{trip.name || `Trip for ${new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}`}</CardTitle>
                                <CardDescription>{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</CardDescription>
                                <Badge variant="secondary" className="absolute top-4 right-4"><Wine className="w-3 h-3 mr-1" /> {trip.wineries?.length || 0} Wineries</Badge>
                            </CardHeader>
                            <CardContent className="flex justify-between items-center">
                                <Button onClick={() => handleViewTrip(trip.id)}>View Details <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                <div className="flex items-center gap-2">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button size="icon" variant="outline" onClick={() => handleExportToMaps(trip.wineries)} disabled={!trip.wineries || trip.wineries.length === 0}>
                                                    <Share2 size={16} />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Export to Google Maps</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
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
                                </div>
                            </CardContent>
                        </Card>
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