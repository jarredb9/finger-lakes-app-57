import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { FriendRating, WineryDbId } from '@/lib/types'; // Import WineryDbId
import { createClient } from '@/utils/supabase/client';

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

export interface FriendActivityItem {
  activity_type: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  winery_id: number;
  winery_name: string;
  visit_rating: number | null;
  visit_review: string | null;
  visit_photos: string[] | null;
}

interface FriendState {
  friends: Friend[];
  friendRequests: Friend[];
  sentRequests: Friend[];
  friendActivityFeed: FriendActivityItem[];
  isLoading: boolean;
  error: string | null;
  friendsRatings: FriendRating[];
  friendsActivity: FriendActivityData;
  fetchFriends: () => Promise<void>;
  fetchFriendActivityFeed: () => Promise<void>;
  addFriend: (email: string) => Promise<void>;
  acceptFriend: (requesterId: string) => Promise<void>;
  rejectFriend: (requesterId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  respondToRequest: (requesterId: string, accept: boolean) => Promise<void>;
  fetchFriendDataForWinery: (wineryId: WineryDbId) => Promise<void>;
  reset: () => void;
}

export const useFriendStore = createWithEqualityFn<FriendState>((set, get) => ({
  friends: [],
  friendRequests: [],
  sentRequests: [],
  friendActivityFeed: [],
  isLoading: false,
  error: null,
  friendsRatings: [],
  friendsActivity: { favoritedBy: [], wishlistedBy: [] },

  fetchFriends: async () => {
    set({ isLoading: true });
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_friends_and_requests');
      
      if (error) throw error;

      // RPC returns a combined object, destructure it
      // Based on typical structure of get_friends_and_requests
      const { friends, requests, sent_requests } = data as any; 

      set({ 
          friends: friends || [], 
          friendRequests: requests || [], 
          sentRequests: sent_requests || [],
          isLoading: false 
      });
    } catch (error: any) {
      set({ isLoading: false, error: error.message });
    }
  },

  fetchFriendActivityFeed: async () => {
    // Only set loading if not already loading friends (to avoid double spinner)
    if (!get().isLoading) set({ isLoading: true });
    
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_friend_activity_feed');
      
      if (error) throw error;

      set({ friendActivityFeed: data || [] });
    } catch (error: any) {
      // Don't set global error state here to avoid blocking other UI
    } finally {
      set({ isLoading: false });
    }
  },

  addFriend: async (email: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc('send_friend_request', { target_email: email });

    if (error) {
      throw new Error(error.message || "Failed to send friend request.");
    }
    await get().fetchFriends(); // Refetch to show pending request in "Sent Requests"
  },

  acceptFriend: async (requesterId: string) => {
    await get().respondToRequest(requesterId, true);
  },

  rejectFriend: async (requesterId: string) => {
    await get().respondToRequest(requesterId, false);
  },

  removeFriend: async (friendId: string) => {
    // Optimistic Update
    const originalFriends = get().friends;
    const originalSentRequests = get().sentRequests;
    
    // Check if it's a friend or a sent request
    const isFriend = originalFriends.some(f => f.id === friendId);
    const isSentRequest = originalSentRequests.some(f => f.id === friendId);

    if (isFriend) {
        set({ friends: originalFriends.filter(f => f.id !== friendId) });
    } else if (isSentRequest) {
        set({ sentRequests: originalSentRequests.filter(f => f.id !== friendId) });
    }

    const supabase = createClient();
    try {
      const { error } = await supabase.rpc('remove_friend', { target_friend_id: friendId });

      if (error) throw error;
    } catch (error) {
      // Revert state
      if (isFriend) set({ friends: originalFriends });
      if (isSentRequest) set({ sentRequests: originalSentRequests });
      throw error;
    }
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

    const supabase = createClient();
    try {
      const { error } = await supabase.rpc('respond_to_friend_request', { 
        requester_id: requesterId, 
        accept: accept 
      });
      
      if (error) {
          throw new Error(error.message || "Failed to update friend request.");
      }
      
      await get().fetchFriends(); 
    } catch (error) {
      set({ friends: originalFriends, friendRequests: originalRequests });
      throw error;
    }
  },

  fetchFriendDataForWinery: async (wineryId: WineryDbId) => {
    // Runtime guard: Ensure wineryId is a number
    if (typeof wineryId !== 'number') {
        return;
    }

    set({ isLoading: true });
    const supabase = createClient();
    try {
      // Parallel RPC calls
      const [ratingsResult, activityResult] = await Promise.all([
        supabase.rpc('get_friends_ratings_for_winery', { winery_id_param: wineryId }),
        supabase.rpc('get_friends_activity_for_winery', { winery_id_param: wineryId })
      ]);

      if (ratingsResult.error) {
          set({ friendsRatings: [] });
      } else {
          // Transform signed URLs if needed, but RPC returns public URLs or paths?
          // The RPC returns { photos: string[] }. Assuming they are paths, we might need to sign them.
          // However, previous API route signed them. 
          // For now, let's assume the RPC returns accessible paths or the component handles it.
          // If photos are private, we need a separate step to sign them.
          // Let's implement signing here to match previous behavior if needed.
          
          let ratings = ratingsResult.data || [];
          // Sign photos logic
          // Collect all photos
          const allPhotos = ratings.flatMap((r: any) => r.photos || []);
          if (allPhotos.length > 0) {
              const { data: signedUrlsData } = await supabase.storage
                  .from('visit-photos')
                  .createSignedUrls(allPhotos, 3600);
              
              if (signedUrlsData) {
                  const urlMap = new Map(signedUrlsData.map(u => [u.path, u.signedUrl]));
                  ratings = ratings.map((r: any) => ({
                      ...r,
                      photos: r.photos?.map((p: string) => urlMap.get(p) || p) || []
                  }));
              }
          }

          set({ friendsRatings: ratings });
      }

      if (activityResult.error) {
          set({ friendsActivity: { favoritedBy: [], wishlistedBy: [] } });
      } else {
          // Cast the JSON result to the expected type
          const activity = activityResult.data as any; // RPC returns Json
          set({ 
              friendsActivity: { 
                  favoritedBy: activity?.favoritedBy || [], 
                  wishlistedBy: activity?.wishlistedBy || [] 
              } 
          });
      }
    } catch (error) {
      set({ friendsRatings: [], friendsActivity: { favoritedBy: [], wishlistedBy: [] } });
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () => set({
    friends: [],
    friendRequests: [],
    sentRequests: [],
    friendActivityFeed: [],
    isLoading: false,
    error: null,
    friendsRatings: [],
    friendsActivity: { favoritedBy: [], wishlistedBy: [] },
  }),
}), shallow);
