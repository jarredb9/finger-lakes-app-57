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
  privacy_level?: 'public' | 'friends_only' | 'private';
}

interface FriendActivityData {
  favoritedBy: Friend[];
  wishlistedBy: Friend[];
}

export interface FriendActivityItem {
  activity_type: string;
  created_at: string;
  activity_user_id: string;
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
  subscription: any;
  selectedFriendProfile: any | null;
  fetchFriends: () => Promise<void>;
  fetchFriendActivityFeed: () => Promise<void>;
  fetchFriendProfile: (friendId: string) => Promise<void>;
  addFriend: (email: string) => Promise<void>;
  acceptFriend: (requesterId: string) => Promise<void>;
  rejectFriend: (requesterId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  respondToRequest: (requesterId: string, accept: boolean) => Promise<void>;
  fetchFriendDataForWinery: (wineryId: WineryDbId) => Promise<void>;
  subscribeToSocialUpdates: () => void;
  unsubscribeFromSocialUpdates: () => void;
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
  subscription: null as any,
  selectedFriendProfile: null,

  subscribeToSocialUpdates: () => {
    if (get().subscription) return;

    const supabase = createClient();
    console.log('[friendStore] Subscribing to social updates...');

    const subscription = supabase
      .channel('social-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visits' },
        async (payload) => {
          console.log('[friendStore] Received visit change payload:', JSON.stringify(payload));
          await get().fetchFriendActivityFeed();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friends' },
        async (payload) => {
          console.log('[friendStore] Received friend change payload:', JSON.stringify(payload));
          await get().fetchFriends();
          await get().fetchFriendActivityFeed();
        }
      )
      .subscribe((status) => {
        console.log('[friendStore] Subscription status:', status);
      });

    set({ subscription });
  },

  unsubscribeFromSocialUpdates: () => {
    const { subscription } = get();
    if (subscription) {
      subscription.unsubscribe();
      set({ subscription: null });
    }
  },

  fetchFriends: async () => {
    set({ isLoading: true });
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_friends_and_requests');
      
      if (error) throw error;

      // RPC returns a combined object, destructure it
      // Based on actual structure of get_friends_and_requests: { friends, pending_incoming, pending_outgoing }
      const { friends, pending_incoming, pending_outgoing } = data as any; 

      set({ 
          friends: friends || [], 
          friendRequests: pending_incoming || [], 
          sentRequests: pending_outgoing || [],
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
      const { data, error } = await supabase.rpc('get_friend_activity_feed', { 
          limit_val: 20
      });
      
      if (error) throw error;

      let feedItems: FriendActivityItem[] = data || [];

      // Collect all photo paths
      const allPhotos = feedItems.flatMap((item) => item.visit_photos || []);
      
      if (allPhotos.length > 0) {
        const { data: signedUrlsData, error: signedError } = await supabase.storage
          .from('visit-photos')
          .createSignedUrls(allPhotos, 3600);
        
        if (!signedError && signedUrlsData) {
          const urlMap = new Map(signedUrlsData.map(u => [u.path, u.signedUrl]));
          feedItems = feedItems.map(item => ({
            ...item,
            visit_photos: item.visit_photos?.map(p => urlMap.get(p) || p) || []
          }));
        }
      }

      set({ friendActivityFeed: feedItems });
    } catch (error: any) {
      console.error('Error fetching friend activity feed:', error);
      // Don't set global error state here to avoid blocking other UI
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFriendProfile: async (friendId: string) => {
    set({ isLoading: true, selectedFriendProfile: null });
    const supabase = createClient();
    try {
        const { data, error } = await supabase.rpc('get_friend_profile_with_visits', {
            friend_id_param: friendId
        });

        if (error) throw error;
        
        // Handle explicit error from RPC (access denied)
        if (data && (data as any).error) {
            throw new Error((data as any).error);
        }

        let profileData = data as any;

        // Sign photos for the friend's visits
        const visits = profileData?.visits || [];
        const allPhotos = visits.flatMap((v: any) => v.photos || []);
        if (allPhotos.length > 0) {
            const { data: signedUrlsData, error: signedError } = await supabase.storage
                .from('visit-photos')
                .createSignedUrls(allPhotos, 3600);

            if (!signedError && signedUrlsData) {
                const urlMap = new Map(signedUrlsData.map(u => [u.path, u.signedUrl]));
                profileData.visits = visits.map((v: any) => ({
                    ...v,
                    photos: v.photos?.map((p: string) => urlMap.get(p) || p) || []
                }));
            }
        }

        set({ selectedFriendProfile: profileData });
    } catch (error: any) {
        console.error('Error fetching friend profile:', error);
        set({ error: error.message });
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
    selectedFriendProfile: null,
  }),
}), shallow);
// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useFriendStore = useFriendStore;
}
