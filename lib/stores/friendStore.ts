import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { FriendRating } from '@/lib/types';

interface Friend {
  id: string;
  name: string;
  email: string;
  status?: 'pending' | 'accepted';
  requester_id?: string;
}

interface FriendActivityData {
  favoritedBy: Friend[];
  wishlistedBy: Friend[];
}

interface FriendState {
  friends: Friend[];
  friendRequests: Friend[];
  isLoading: boolean;
  error: string | null;
  friendsRatings: FriendRating[];
  friendsActivity: FriendActivityData;
  fetchFriends: () => Promise<void>;
  addFriend: (email: string) => Promise<void>;
  acceptFriend: (requesterId: string) => Promise<void>;
  rejectFriend: (requesterId: string) => Promise<void>;
  respondToRequest: (requesterId: string, accept: boolean) => Promise<void>;
  fetchFriendDataForWinery: (wineryId: number) => Promise<void>;
}

export const useFriendStore = createWithEqualityFn<FriendState>((set, get) => ({
  friends: [],
  friendRequests: [],
  isLoading: false,
  error: null,
  friendsRatings: [],
  friendsActivity: { favoritedBy: [], wishlistedBy: [] },

  fetchFriends: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/friends');
      if (response.ok) {
        const data = await response.json();
        set({ friends: data.friends || [], friendRequests: data.requests || [], isLoading: false });
      } else {
        throw new Error("Failed to fetch friends");
      }
    } catch (error: any) {
      console.error(error);
      set({ isLoading: false, error: error.message });
    }
  },

  addFriend: async (email: string) => {
    const response = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error || "Failed to send friend request.");
    }
    await get().fetchFriends(); // Refetch to show pending request
  },

  acceptFriend: async (requesterId: string) => {
    await get().respondToRequest(requesterId, true);
  },

  rejectFriend: async (requesterId: string) => {
    await get().respondToRequest(requesterId, false);
  },

  respondToRequest: async (requesterId: string, accept: boolean) => {
    const response = await fetch('/api/friends', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, accept }),
    });
    if (!response.ok) throw new Error("Failed to update friend request.");
    await get().fetchFriends(); // Refetch to update lists
  },

  fetchFriendDataForWinery: async (wineryId: number) => {
    set({ isLoading: true });
    try {
      const [ratingsResponse, activityResponse] = await Promise.all([
        fetch(`/api/wineries/${wineryId}/friends-ratings`),
        fetch(`/api/wineries/${wineryId}/friends-activity`)
      ]);

      if (ratingsResponse.ok) {
        const ratings = await ratingsResponse.json();
        set({ friendsRatings: ratings || [] });
      } else {
        console.error('Failed to fetch friends ratings');
        set({ friendsRatings: [] });
      }

      if (activityResponse.ok) {
        const activity = await activityResponse.json();
        set({ friendsActivity: activity || { favoritedBy: [], wishlistedBy: [] } });
      } else {
        console.error('Failed to fetch friends activity');
        set({ friendsActivity: { favoritedBy: [], wishlistedBy: [] } });
      }
    } catch (error) {
      console.error('Error fetching friend data for winery:', error);
      set({ friendsRatings: [], friendsActivity: { favoritedBy: [], wishlistedBy: [] } });
    } finally {
      set({ isLoading: false });
    }
  },
}), shallow);