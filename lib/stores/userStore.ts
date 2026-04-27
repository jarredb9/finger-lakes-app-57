import { createWithEqualityFn } from 'zustand/traditional';
import { createClient } from '@/utils/supabase/client';
import { ProfileService } from '@/lib/services/profileService';
import { isE2E, shouldSkipRealSync } from './e2e-utils';
import { enqueueIfOffline, handleSyncError } from './sync-utils';

export interface User {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  privacy_level?: 'public' | 'friends_only' | 'private';
}

interface UserState {
  user: User | null;
  isLoading: boolean;
  fetchUser: () => Promise<void>;
  updatePrivacyLevel: (level: User['privacy_level']) => Promise<void>;
  logout: () => Promise<void>;
  reset: () => void;
}

export const useUserStore = createWithEqualityFn<UserState>((set, get) => ({
  user: null,
  isLoading: false,

  fetchUser: async () => {
    if (isE2E() && shouldSkipRealSync()) return;
    set({ isLoading: true });
    const supabase = createClient();
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        set({ user: null, isLoading: false });
        return;
      }

      const profile = await ProfileService.fetchProfile(authUser.id);
      set({ 
        user: { 
          id: authUser.id, 
          email: authUser.email,
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
          privacy_level: profile?.privacy_level || 'private'
        }, 
        isLoading: false 
      });
    } catch (error) {
      console.error('Failed to fetch user', error);
      set({ isLoading: false });
    }
  },

  updatePrivacyLevel: async (level) => {
    const currentUser = get().user;
    if (!currentUser) return;

    const syncPayload = { type: 'privacy', level };

    if (await enqueueIfOffline('update_profile', currentUser.id, syncPayload)) {
        set({
            user: { ...currentUser, privacy_level: level }
        });
        return;
    }

    try {
      await ProfileService.updatePrivacyLevel(level!);
      set({
        user: { ...currentUser, privacy_level: level }
      });
    } catch (error) {
      if (await handleSyncError(error, 'update_profile', currentUser.id, syncPayload)) {
          set({
              user: { ...currentUser, privacy_level: level }
          });
          return;
      }
      console.error('Failed to update privacy level', error);
      throw error;
    }
  },

  logout: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    get().reset();
  },

  reset: () => set({ user: null, isLoading: false }),
}));

if (typeof window !== 'undefined') {
  (window as any).useUserStore = useUserStore;
}
