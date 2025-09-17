'use client';

import { useState, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTripStore } from "@/lib/stores/tripStore";
import TripCard from "@/components/trip-card";
import { User } from "@supabase/supabase-js";

export default function TripPlanner({ initialDate, user }: { initialDate: Date, user: User }) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
    const { toast } = useToast();

    const { tripsForDate, isLoading, fetchTripsForDate, createTrip } = useTripStore();

    const fetchCallback = useCallback(fetchTripsForDate, [fetchTripsForDate]);

    useEffect(() => {
        if (selectedDate) {
            fetchCallback(selectedDate);
        }
    }, [selectedDate, fetchCallback]);

    const handleCreateTrip = async () => {
        if (!selectedDate) return;
        try {
            const newTrip = await createTrip(selectedDate);
            if (newTrip) {
                toast({ title: "Success", description: "New trip created." });
            } else {
                toast({ variant: "destructive", title: "Error", description: "Could not create new trip." });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Could not create trip." });
        }
    };

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
            <Button onClick={handleCreateTrip}><PlusCircle className="mr-2 h-4 w-4" /> Create New Trip</Button>
        </div>

        {isLoading ? <p>Loading trips...</p> : tripsForDate.length > 0 ? (
            tripsForDate.map(trip => (
                <TripCard 
                    key={trip.id} 
                    tripId={trip.id} 
                    userId={user.id}
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
