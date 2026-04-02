"use client";

import { Trip } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useToast } from "@/hooks/use-toast";
import { useTripActions } from "@/hooks/use-trip-actions";
import TripCardPresentational from "./TripCardPresentational";

export default function TripCard({ trip }: { trip: Trip }) {
  const { toast } = useToast();
  const { 
    updateTrip, 
    deleteTrip, 
    updateWineryOrder, 
    toggleWineryOnTrip, 
    removeWineryFromTrip, 
    saveWineryNote 
  } = useTripStore();
  const { user } = useUserStore();
  const { openShareDialog, openWineryNoteEditor } = useUIStore();
  
  const { 
    currentMembers, 
    handleExportToMaps 
  } = useTripActions(trip);

  if (!trip) return null;

  const isOwner = user?.id && trip.user_id && String(user.id).toLowerCase() === String(trip.user_id).toLowerCase();
  const isMember = trip.members?.some(m => m.id === user?.id);
  const canEdit = isOwner || isMember;

  const handleUpdateTrip = async (id: string, updates: { name?: string; trip_date?: string }) => {
    try {
      await updateTrip(id, updates);
      toast({ description: "Trip updated successfully." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update trip." });
      throw error;
    }
  };

  const handleDeleteTrip = async (id: string) => {
    try {
      await deleteTrip(id);
      toast({ description: "Trip deleted successfully." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to delete trip." });
      throw error;
    }
  };

  const handleRemoveWineryFromTrip = async (tripId: string, wineryDbId: number) => {
    try {
      await removeWineryFromTrip(tripId, wineryDbId);
      toast({ description: "Winery removed from trip." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to remove winery." });
      throw error;
    }
  };

  const handleSaveWineryNote = async (wineryId: number, newNotes: string) => {
    try {
      await saveWineryNote(trip.id.toString(), wineryId, newNotes);
      toast({ description: "Notes saved." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to save notes." });
      throw error;
    }
  };

  return (
    <TripCardPresentational
      trip={trip}
      isOwner={!!isOwner}
      canEdit={!!canEdit}
      currentMembers={currentMembers}
      onUpdateTrip={handleUpdateTrip}
      onDeleteTrip={handleDeleteTrip}
      onUpdateWineryOrder={updateWineryOrder}
      onToggleWineryOnTrip={toggleWineryOnTrip}
      onRemoveWineryFromTrip={handleRemoveWineryFromTrip}
      onSaveWineryNote={handleSaveWineryNote}
      onOpenShareDialog={openShareDialog}
      onOpenWineryNoteEditor={openWineryNoteEditor}
      onExportToMaps={handleExportToMaps}
    />
  );
}
