"use client";

import { Trip } from "@/lib/types";
import { useUserStore } from "@/lib/stores/userStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useTripActions } from "@/hooks/use-trip-actions";
import TripCardSimplePresentational from "./TripCardSimplePresentational";

interface TripCardSimpleProps {
    trip: Trip;
    onDelete: (tripId: number) => void;
}

export default function TripCardSimple({ trip, onDelete }: TripCardSimpleProps) {
    const { openShareDialog } = useUIStore();
    const { user } = useUserStore();
    
    const { 
        currentMembers, 
        handleExportToMaps 
    } = useTripActions(trip);

    const isOwner = user?.id && trip.user_id && String(user.id).toLowerCase() === String(trip.user_id).toLowerCase();

    return (
        <TripCardSimplePresentational
            trip={trip}
            isOwner={!!isOwner}
            currentMembers={currentMembers}
            onDelete={onDelete}
            onShare={openShareDialog}
            onExportToMaps={handleExportToMaps}
        />
    );
}
