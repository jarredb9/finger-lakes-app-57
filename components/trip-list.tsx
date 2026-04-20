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
    const [tripToDelete, setTripToDelete] = useState<number | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        fetchTrips(1, tripType, true);
    }, [fetchTrips, tripType]);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        fetchTrips(newPage, tripType);
    };

    const handleDeleteClick = (tripId: number) => {
        setTripToDelete(tripId);
    };

    const handleConfirmDelete = async () => {
        if (tripToDelete === null) return;
        try {
            await deleteTrip(tripToDelete.toString());
            toast({ description: "Trip deleted successfully." });
            setTripToDelete(null);
            fetchTrips(1, tripType, true);
        } catch (error) {
            toast({ variant: 'destructive', description: "Failed to delete trip." });
            setTripToDelete(null);
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
            onDeleteTrip={handleDeleteClick}
            onConfirmDelete={handleConfirmDelete}
            onCancelDelete={() => setTripToDelete(null)}
            tripToDelete={tripToDelete}
            onExploreClick={onExploreClick}
            today={getTodayLocal()}
        />
    );
}
