import { useToast } from "@/hooks/use-toast";
import { Trip } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useEffect } from "react";
import { NavigationProvider, launchTripNavigation } from "@/lib/utils/trip-navigation";

export function useTripActions(trip: Trip) {
  const { toast } = useToast();
  const { addMembersToTrip } = useTripStore();
  const { fetchFriends } = useFriendStore();

  const currentMembers = trip.members || [];

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleExportToMaps = (provider: NavigationProvider = 'google') => {
    if (!trip.wineries || trip.wineries.length === 0) return;
    launchTripNavigation(provider, trip.wineries);
  };

  const saveTripMembers = async (membersToSave?: string[]) => {
    const finalMembers = membersToSave || currentMembers.map(m => m.id);
    try {
      await addMembersToTrip(trip.id.toString(), finalMembers);
      toast({ description: "Trip members updated." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update members." });
    }
  };

  return {
    selectedFriends: currentMembers.map(m => m.id),
    currentMembers,
    handleExportToMaps,
    saveTripMembers,
  };
}
