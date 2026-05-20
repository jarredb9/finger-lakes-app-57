'use client';

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Share2 } from "lucide-react";
import { useTripStore } from "@/lib/stores/tripStore";
import TripCard from "@/components/trip-card";
import { AuthenticatedUser } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import TripForm from "./trip-form";
import { useUIStore } from "@/lib/stores/uiStore";
import { formatDateLocal } from "@/lib/utils";

export default function TripPlanner({ initialDate, user, hideCalendar = false, hideTrips = false }: { initialDate: Date, user: AuthenticatedUser, hideCalendar?: boolean, hideTrips?: boolean }) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const [isCreateTripModalOpen, setCreateTripModalOpen] = useState(false);
    const { openShareDialog } = useUIStore();
    const [isMounted, setIsMounted] = useState(false);

    const { tripsForDate = [], isLoading, fetchTripsForDate } = useTripStore();

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (selectedDate) {
            fetchTripsForDate(formatDateLocal(selectedDate));
        }
    }, [selectedDate, fetchTripsForDate]);

    return (
        <div className="space-y-6">
            {/* Date Selection */}
            {!hideCalendar && (
                <Card className="w-full">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium uppercase text-muted-foreground">Select Date</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            className="rounded-md border shadow-xs"
                        />
                    </CardContent>
                </Card>
            )}

            {/* Trips List */}
            {!hideTrips && (
                <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h2 className="text-lg font-bold">
                        {isMounted && selectedDate ? selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '...'}
                    </h2>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {tripsForDate.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 sm:flex-none"
                                onClick={() => openShareDialog(tripsForDate[0].id.toString(), `Itinerary for ${selectedDate?.toLocaleDateString()}`)}
                                data-testid="share-day-btn"
                            >
                                <Share2 className="mr-2 h-4 w-4" /> Share Day
                            </Button>
                        )}
                        <Dialog open={isCreateTripModalOpen} onOpenChange={setCreateTripModalOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="flex-1 sm:flex-none"><PlusCircle className="mr-2 h-4 w-4" /> New Trip</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Create a New Trip</DialogTitle>
                                </DialogHeader>
                                <TripForm user={user} initialDate={selectedDate} />
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-48 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                ) : tripsForDate.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {tripsForDate.map((trip) => (
                            <TripCard 
                                key={trip.id} 
                                trip={trip} 
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                            <p className="text-muted-foreground mb-4">No trips planned for this date.</p>
                            <Button variant="outline" size="sm" onClick={() => setCreateTripModalOpen(true)}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Plan First Stop
                            </Button>
                        </CardContent>
                    </Card>
                )}
                </div>
            )}
        </div>
    );
}
