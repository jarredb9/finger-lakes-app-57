'use client';

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useTripStore } from "@/lib/stores/tripStore";
import TripCard from "@/components/trip-card";
import { AuthenticatedUser } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import TripForm from "./trip-form";

export default function TripPlanner({ initialDate, user, hideCalendar = false, hideTrips = false }: { initialDate: Date, user: AuthenticatedUser, hideCalendar?: boolean, hideTrips?: boolean }) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const [isCreateTripModalOpen, setCreateTripModalOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const { tripsForDate, isLoading, fetchTripsForDate } = useTripStore();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (selectedDate) {
            fetchTripsForDate(selectedDate.toISOString().split('T')[0]);
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
                            className="rounded-md border shadow-sm"
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
                    <Dialog open={isCreateTripModalOpen} onOpenChange={setCreateTripModalOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="w-full sm:w-auto"><PlusCircle className="mr-2 h-4 w-4" /> New Trip</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create a New Trip</DialogTitle>
                            </DialogHeader>
                            <TripForm user={user} initialDate={selectedDate} />
                        </DialogContent>
                    </Dialog>
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        <Card>
                            <CardContent className="p-4 flex flex-col space-y-2">
                                <Skeleton className="h-8 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-1/2" />
                            </CardContent>
                        </Card>
                    </div>
                ) : tripsForDate.length > 0 ? (
                    tripsForDate.map(trip => (
                        <TripCard 
                            key={trip.id} 
                            trip={trip}
                        />
                    ))
                ) : (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="text-center py-8">
                            <p className="text-muted-foreground text-sm">No trips planned for this day.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
            )}
        </div>
    );
}