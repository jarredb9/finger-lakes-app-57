import { useToast } from "@/hooks/use-toast";
import { Friend, Trip } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useState, useEffect } from "react";

export function useTripActions(trip: Trip) {
  const { toast } = useToast();
  const { addMembersToTrip } = useTripStore();
  const { friends, fetchFriends } = useFriendStore();
  const [selectedFriends, setSelectedFriends] = useState<string[]>(trip.members || []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedFriends(trip.members || []);
  }, [trip.members]);

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

  const toggleFriendSelection = (friendId: string) => {
    let newSelection: string[] = [];
    setSelectedFriends(prev => {
      newSelection = prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId];
      return newSelection;
    });
    return newSelection;
  };

  const saveTripMembers = async (membersToSave?: string[]) => {
    const finalMembers = membersToSave || selectedFriends;
    try {
      await addMembersToTrip(trip.id.toString(), finalMembers);
      toast({ description: "Trip members updated." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update members." });
    }
  };

  const currentMembers = friends.filter((f: Friend) => trip.members?.includes(f.id));

  return {
    friends,
    selectedFriends,
    currentMembers,
    handleExportToMaps,
    toggleFriendSelection,
    saveTripMembers,
  };
}
