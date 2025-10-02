'use client';

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useTripStore } from "@/lib/stores/tripStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import TripCard from "@/components/trip-card";
import { AuthenticatedUser } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { APIProvider } from "@vis.gl/react-google-maps";
import TripForm from "./trip-form";

export default function TripPlanner({ initialDate, user }: { initialDate: Date, user: AuthenticatedUser }) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const [isCreateTripModalOpen, setCreateTripModalOpen] = useState(false);

    const { tripsForDate, isLoading, fetchTripsForDate } = useTripStore();
    const { wineries } = useWineryStore();

    useEffect(() => {
        if (selectedDate) {
            fetchTripsForDate(selectedDate.toISOString().split('T')[0]);
        }
    }, [selectedDate, fetchTripsForDate]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Select a Date</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            className="rounded-md border"
                        />
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-2 space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <h2 className="text-2xl font-bold">Trips for {selectedDate ? selectedDate.toLocaleDateString() : '...'}</h2>
                    <Dialog open={isCreateTripModalOpen} onOpenChange={setCreateTripModalOpen}>
                        <DialogTrigger asChild>
                            <Button><PlusCircle className="mr-2 h-4 w-4" /> Create New Trip</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create a New Trip</DialogTitle>
                            </DialogHeader>
                            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
                                <TripForm user={user} initialDate={selectedDate} />
                            </APIProvider>
                        </DialogContent>
                    </Dialog>
                </div>

                {isLoading ? <p>Loading trips...</p> : tripsForDate.length > 0 ? (
                    tripsForDate.map(trip => (
                        <TripCard 
                            key={trip.id} 
                            trip={trip}
                            allWineries={wineries}
                        />
                    ))
                ) : (
                    <Card>
                        <CardContent className="text-center py-12">
                            <p className="text-muted-foreground">No trips planned for this day.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
