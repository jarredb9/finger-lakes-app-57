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
    // Optimistic Update
    const originalFriends = get().friends;
    const originalRequests = get().friendRequests;
    
    const request = originalRequests.find(r => r.id === requesterId);
    
    if (request) {
        const newRequests = originalRequests.filter(r => r.id !== requesterId);
        let newFriends = originalFriends;
        
        if (accept) {
            newFriends = [...originalFriends, { ...request, status: 'accepted' }];
        }
        
        set({ friends: newFriends, friendRequests: newRequests });
    }

    try {
      const response = await fetch('/api/friends', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId, accept }),
      });
      
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to update friend request.");
      }
      // We can optionally refetch to be 100% sure, but the optimistic state should be correct.
      // Keeping refetch for safety on other metadata that might return
      await get().fetchFriends(); 
    } catch (error) {
      console.error("Failed to respond to friend request, reverting:", error);
      set({ friends: originalFriends, friendRequests: originalRequests });
      throw error;
    }
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