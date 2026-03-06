"use client";

import { useUIStore } from '@/lib/stores/uiStore';
import { TripShareDialog } from '@/components/TripShareDialog';

export function TripShareDialogWrapper() {
    const isShareDialogOpen = useUIStore(state => state.isShareDialogOpen);
    const shareTripId = useUIStore(state => state.shareTripId);
    const shareTripName = useUIStore(state => state.shareTripName);
    const closeShareDialog = useUIStore(state => state.closeShareDialog);
    
    if (!isShareDialogOpen || !shareTripId) return null;
    return (
        <TripShareDialog 
            isOpen={isShareDialogOpen} 
            onClose={closeShareDialog} 
            tripId={shareTripId} 
            tripName={shareTripName || ""} 
        />
    );
}
