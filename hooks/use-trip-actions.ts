import { useToast } from "@/hooks/use-toast";
import { Trip } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useEffect } from "react";

export function useTripActions(trip: Trip) {
  const { toast } = useToast();
  const { addMembersToTrip } = useTripStore();
  const { fetchFriends } = useFriendStore();

  const currentMembers = trip.members || [];

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleExportToMaps = () => {
    if (!trip.wineries || trip.wineries.length === 0) return;

    const waypoints = trip.wineries.map(w => encodeURIComponent(`${w.name}, ${w.address}`));
    let url = 'https://www.google.com/maps/dir/';

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = `${position.coords.latitude},${position.coords.longitude}`;
          if (waypoints.length > 0) {
             const destination = waypoints.pop();
             // If only 1 winery, waypoints is empty after pop, join returns empty string
             const waypointStr = waypoints.length > 0 ? `/${waypoints.join('/')}` : '';
             url += `${userLocation}${waypointStr}/${destination}`;
          } else {
             // Should not happen due to length check
             return; 
          }
          window.open(url, '_blank');
        },
        () => {
          url += waypoints.join('/');
          window.open(url, '_blank');
        }
      );
    } else {
      url += waypoints.join('/');
      window.open(url, '_blank');
    }
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
