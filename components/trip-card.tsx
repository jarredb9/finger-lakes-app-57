"use client";

import { useState, useEffect } from "react";
import { Trip, Winery } from "@/lib/types";
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

  const [winerySearch, setWinerySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!winerySearch.trim() || !trip?.wineries) {
      setSearchResults([]);
      return;
    }

    const debounceSearch = setTimeout(() => {
      const search = async () => {
        setIsSearching(true);
        const fetchUrl = `/api/wineries?query=${encodeURIComponent(winerySearch)}`;
        try {
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            throw new Error('Search failed');
          }
          const results: Winery[] = await response.json();
          const tripWineryIds = new Set((trip.wineries || []).map(w => w.id));
          const finalResults = results.filter(r => !tripWineryIds.has(r.id));
          setSearchResults(finalResults);
        } catch (error) {
          toast({ variant: "destructive", description: "Search failed." });
        } finally {
          setIsSearching(false);
        }
      };
      search();
    }, 500);

    return () => clearTimeout(debounceSearch);
  }, [winerySearch, trip?.wineries, toast]);

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
      searchResults={searchResults}
      isSearching={isSearching}
      winerySearch={winerySearch}
      onSearchChange={setWinerySearch}
    />
  );
}
