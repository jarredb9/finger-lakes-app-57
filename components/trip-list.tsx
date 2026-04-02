"use client";

import { useState, useEffect } from 'react';
import { useTripStore } from '@/lib/stores/tripStore';
import { AuthenticatedUser } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { getTodayLocal } from '@/lib/utils';
import TripListPresentational from './TripListPresentational';

export default function TripList({ user, onExploreClick }: { user: AuthenticatedUser, onExploreClick?: () => void }) {
    const { trips = [], isLoading, error, page = 1, hasMore, fetchTrips, setPage, deleteTrip } = useTripStore();
    const [tripType, setTripType] = useState<'upcoming' | 'past'>('upcoming');
    const { toast } = useToast();

    useEffect(() => {
        fetchTrips(1, tripType, true);
    }, [fetchTrips, tripType]);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        fetchTrips(newPage, tripType);
    };

    const handleDeleteTrip = async (tripId: number) => {
        try {
            await deleteTrip(tripId.toString());
            toast({ description: "Trip deleted successfully." });
            fetchTrips(1, tripType, true);
        } catch (error) {
            toast({ variant: 'destructive', description: "Failed to delete trip." });
            throw error;
        }
    };

    return (
        <TripListPresentational
            user={user}
            trips={trips}
            isLoading={isLoading}
            error={error}
            page={page}
            hasMore={hasMore}
            tripType={tripType}
            onTripTypeChange={setTripType}
            onPageChange={handlePageChange}
            onDeleteTrip={handleDeleteTrip}
            onExploreClick={onExploreClick}
            today={getTodayLocal()}
        />
    );
}
