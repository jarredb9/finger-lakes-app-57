import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createClient } from '@/utils/supabase/client';
import { SocialService } from '@/lib/services/socialService';
import { Friend, FriendActivity, WineryDbId } from '@/lib/types';
import { isE2E, shouldSkipRealSync } from './e2e-utils';
import { enqueueIfOffline, handleSyncError } from './sync-utils';
import { idbStorage } from './idb-persist-storage';
import { RealtimeChannel } from '@supabase/supabase-js';

interface FriendState {
  friends: Friend[];
  friendRequests: Friend[];
  sentRequests: Friend[];
  friendActivityFeed: FriendActivity[];
  friendsActivity: { favoritedBy: any[]; wishlistedBy: any[] };
  friendsRatings: any[];
  selectedFriendProfile: any | null;
  isLoading: boolean;
  error: string | null;
  subscription: RealtimeChannel | null;
  
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchFriendActivityFeed: () => Promise<void>;
  fetchFriendDataForWinery: (wineryId: WineryDbId) => Promise<void>;
  fetchFriendProfile: (friendId: string) => Promise<void>;
  addFriend: (email: string) => Promise<void>;
  acceptFriend: (requesterId: string) => Promise<void>;
  rejectFriend: (requesterId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  subscribeToSocialUpdates: () => void;
  unsubscribeFromSocialUpdates: () => void;
  reset: () => void;
}

export const useFriendStore = createWithEqualityFn<FriendState>()(
  persist(
    (set, get) => ({
      friends: [],
      friendRequests: [],
      sentRequests: [],
      friendActivityFeed: [],
      friendsActivity: { favoritedBy: [], wishlistedBy: [] },
      friendsRatings: [],
      selectedFriendProfile: null,
      isLoading: false,
      error: null,
      subscription: null,

      fetchFriends: async () => {
        if (isE2E() && shouldSkipRealSync()) return;
        set({ isLoading: true });
        try {
          const friends = await SocialService.getFriends();
          set({ friends, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      fetchRequests: async () => {
        if (isE2E() && shouldSkipRealSync()) return;
        set({ isLoading: true });
        try {
          const { incoming, outgoing } = await SocialService.getFriendRequests();
          set({ friendRequests: incoming, sentRequests: outgoing, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      fetchFriendActivityFeed: async () => {
        if (isE2E() && shouldSkipRealSync()) return;
        set({ isLoading: true });
        try {
          const activity = await SocialService.getFriendActivity();
          set({ friendActivityFeed: activity, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      fetchFriendProfile: async (friendId) => {
        if (isE2E() && shouldSkipRealSync()) return;
        set({ isLoading: true, error: null });
        try {
          const profile = await SocialService.getFriendProfile(friendId);
          set({ selectedFriendProfile: profile, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      fetchFriendDataForWinery: async (wineryId) => {
        if (isE2E() && shouldSkipRealSync()) return;
        try {
          const { ratings, activity } = await SocialService.getFriendDataForWinery(wineryId);
          set({ friendsRatings: ratings, friendsActivity: activity });
        } catch (error: any) {
          console.error('Failed to fetch friend data for winery', error);
        }
      },

      addFriend: async (email) => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = { action: 'send_request', email };

        if (await enqueueIfOffline('social_action', user?.id, syncPayload)) {
            return;
        }

        try {
          await SocialService.sendFriendRequest(email);
          await get().fetchRequests();
        } catch (error: any) {
          if (await handleSyncError(error, 'social_action', user?.id, syncPayload)) {
              return;
          }
          throw error;
        }
      },

      acceptFriend: async (requesterId) => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = { action: 'respond', requesterId, accept: true };

        if (await enqueueIfOffline('social_action', user?.id, syncPayload)) {
            set(state => ({
                friendRequests: state.friendRequests.filter(r => r.id !== requesterId)
            }));
            return;
        }

        try {
          await SocialService.respondToFriendRequest(requesterId, true);
          await Promise.all([get().fetchRequests(), get().fetchFriends()]);
        } catch (error: any) {
          if (await handleSyncError(error, 'social_action', user?.id, syncPayload)) {
              return;
          }
          throw error;
        }
      },

      rejectFriend: async (requesterId) => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = { action: 'respond', requesterId, accept: false };

        if (await enqueueIfOffline('social_action', user?.id, syncPayload)) {
            set(state => ({
                friendRequests: state.friendRequests.filter(r => r.id !== requesterId)
            }));
            return;
        }

        try {
          await SocialService.respondToFriendRequest(requesterId, false);
          await get().fetchRequests();
        } catch (error: any) {
          if (await handleSyncError(error, 'social_action', user?.id, syncPayload)) {
              return;
          }
          throw error;
        }
      },

      removeFriend: async (friendId) => {
        const originalFriends = get().friends;
        set(state => ({
          friends: state.friends.filter(f => f.id !== friendId)
        }));

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = { action: 'remove', friendId };

        if (await enqueueIfOffline('social_action', user?.id, syncPayload)) {
            return;
        }

        try {
          await SocialService.removeFriend(friendId);
        } catch (error: any) {
          if (await handleSyncError(error, 'social_action', user?.id, syncPayload)) {
              return;
          }
          set({ friends: originalFriends });
          throw error;
        }
      },

      subscribeToSocialUpdates: () => {
        const { subscription: existingSub } = get();
        if (existingSub) return;

        const supabase = createClient();
        const subscription = supabase
          .channel('social-updates')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'friends' },
            async () => {
              await Promise.all([
                get().fetchFriends(),
                get().fetchRequests(),
                get().fetchFriendActivityFeed()
              ]);
            }
          )
          .subscribe();

        set({ subscription });
      },

      unsubscribeFromSocialUpdates: () => {
        const { subscription } = get();
        if (subscription) {
          subscription.unsubscribe();
          set({ subscription: null });
        }
      },

      reset: () => {
        get().unsubscribeFromSocialUpdates();
        set({
          friends: [],
          friendRequests: [],
          sentRequests: [],
          friendActivityFeed: [],
          friendsActivity: { favoritedBy: [], wishlistedBy: [] },
          friendsRatings: [],
          selectedFriendProfile: null,
          isLoading: false,
          error: null,
          subscription: null,
        });
      },
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'friend-storage-e2e' : 'friend-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state): Partial<FriendState> => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return {
          friends: state.friends,
          friendActivityFeed: state.friendActivityFeed.slice(0, 20),
        };
      },
    }
  )
);

if (typeof window !== 'undefined') {
  (window as any).useFriendStore = useFriendStore;
}
