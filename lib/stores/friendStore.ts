import { create } from 'zustand';

interface Friend {
  id: string;
  name: string;
  email: string;
  status?: 'pending' | 'accepted';
  requester_id?: string;
}

interface FriendState {
  friends: Friend[];
  requests: Friend[];
  isLoading: boolean;
  fetchFriends: () => Promise<void>;
  addFriend: (email: string) => Promise<void>;
  respondToRequest: (requesterId: string, accept: boolean) => Promise<void>;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  requests: [],
  isLoading: false,

  fetchFriends: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/friends');
      if (response.ok) {
        const data = await response.json();
        set({ friends: data.friends || [], requests: data.requests || [], isLoading: false });
      } else {
        throw new Error("Failed to fetch friends");
      }
    } catch (error) {
      console.error(error);
      set({ isLoading: false });
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

  respondToRequest: async (requesterId: string, accept: boolean) => {
    const response = await fetch('/api/friends', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, accept }),
    });
    if (!response.ok) throw new Error("Failed to update friend request.");
    await get().fetchFriends(); // Refetch to update lists
  },
}));
