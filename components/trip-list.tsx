"use client";

import { useState, useEffect, useMemo } from 'react';
import { Trip } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function TripList() {
    const [allTrips, setAllTrips] = useState<Trip[]>([]);
    const router = useRouter();

    useEffect(() => {
        async function fetchAllTrips() {
            try {
                const response = await fetch('/api/trips');
                if (response.ok) {
                    const data = await response.json();
                    setAllTrips(data);
                }
            } catch (error) {
                console.error("Failed to fetch all trips", error);
            }
        }
        fetchAllTrips();
    }, []);

    const { pastTrips, upcomingTrips } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today's date

        return allTrips.reduce((acc, trip) => {
            const tripDate = new Date(trip.trip_date);
            if (tripDate < today) {
                acc.pastTrips.push(trip);
            } else {
                acc.upcomingTrips.push(trip);
            }
            return acc;
        }, { pastTrips: [] as Trip[], upcomingTrips: [] as Trip[] });
    }, [allTrips]);

    const handleViewTrip = (date: string) => {
        // Navigate to the planner tab with the specific date selected
        const tripDate = new Date(date).toISOString();
        router.push(`/trips?date=${tripDate}`);
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold mb-4">Upcoming Trips</h2>
                {upcomingTrips.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {upcomingTrips.map(trip => (
                            <Card key={trip.id}>
                                <CardHeader>
                                    <CardTitle>{trip.name || `Trip for ${new Date(trip.trip_date).toLocaleDateString()}`}</CardTitle>
                                    <CardDescription>{new Date(trip.trip_date).toLocaleDateString()}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Button onClick={() => handleViewTrip(trip.trip_date)}>
                                        View Details <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">You have no upcoming trips planned.</p>
                )}
            </div>
            <div>
                <h2 className="text-2xl font-bold mb-4">Past Trips</h2>
                {pastTrips.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {pastTrips.map(trip => (
                            <Card key={trip.id}>
                                <CardHeader>
                                    <CardTitle>{trip.name || `Trip from ${new Date(trip.trip_date).toLocaleDateString()}`}</CardTitle>
                                    <CardDescription>{new Date(trip.trip_date).toLocaleDateString()}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                     <Button onClick={() => handleViewTrip(trip.trip_date)}>
                                        View Details <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">You have no past trips recorded.</p>
                )}
            </div>
        </div>
    );
}