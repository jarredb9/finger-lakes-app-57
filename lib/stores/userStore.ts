import { createWithEqualityFn } from 'zustand/traditional';
import { createClient } from '@/utils/supabase/client';
import { ProfileService } from '@/lib/services/profileService';
import { isE2E, shouldSkipRealSync } from './e2e-utils';
import { enqueueIfOffline, handleSyncError } from './sync-utils';
import { useSyncStore } from './syncStore';
import { useVisitStore } from './visitStore';
import { useTripStore } from './tripStore';
import { useFriendStore } from './friendStore';
import { useWineryStore } from './wineryStore';
import { useMapStore } from './mapStore';
import { useUIStore } from './uiStore';

export interface User {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  privacy_level?: 'public' | 'friends_only' | 'private';
  ai_enabled?: boolean;
}

interface UserState {
  user: User | null;
  isLoading: boolean;
  fetchUser: () => Promise<void>;
  updatePrivacyLevel: (level: User['privacy_level']) => Promise<void>;
  updateAIEnabled: (enabled: boolean) => Promise<void>;
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
      let authUser: any = null;
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (!isOffline) {
        try {
          const { data } = await supabase.auth.getUser();
          authUser = data?.user || null;
        } catch (err) {
          console.warn('[userStore] getUser failed, attempting getSession fallback', err);
        }
      }

      // Offline or network failure fallback: read local stored token via getSession()
      if (!authUser) {
        const { data } = await supabase.auth.getSession();
        authUser = data?.session?.user || null;
      }

      if (!authUser) {
        set({ user: null, isLoading: false });
        return;
      }

      let profile: any = null;
      try {
        profile = await ProfileService.fetchProfile(authUser.id);
      } catch (profileErr) {
        console.warn('[userStore] Failed to fetch profile (may be offline)', profileErr);
      }

      set({ 
        user: { 
          id: authUser.id, 
          email: authUser.email,
          full_name: profile?.full_name || authUser.user_metadata?.full_name,
          avatar_url: profile?.avatar_url || authUser.user_metadata?.avatar_url,
          privacy_level: profile?.privacy_level || 'private',
          ai_enabled: profile?.ai_enabled ?? false
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

  updateAIEnabled: async (enabled) => {
    const currentUser = get().user;
    if (!currentUser) return;

    const syncPayload = { type: 'ai_enabled', enabled };

    if (await enqueueIfOffline('update_profile', currentUser.id, syncPayload)) {
      set({
        user: { ...currentUser, ai_enabled: enabled }
      });
      return;
    }

    try {
      await ProfileService.updateAIEnabled(enabled);
      set({
        user: { ...currentUser, ai_enabled: enabled }
      });
    } catch (error) {
      if (await handleSyncError(error, 'update_profile', currentUser.id, syncPayload)) {
        set({
          user: { ...currentUser, ai_enabled: enabled }
        });
        return;
      }
      console.error('Failed to update AI enabled state', error);
      throw error;
    }
  },

  logout: async () => {
    // 1. First await the asynchronous reset of the sync store to guarantee queue deletion
    await useSyncStore.getState().reset();

    // 2. Safely attempt Supabase signOut with defensive try/catch (resilient against network failure / offline)
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[userStore] Sign out failed (network/offline), proceeding with local store purge', error);
    }

    // 3. Purge CacheStorage (supabase-auth and pages caches)
    if (typeof window !== 'undefined' && 'caches' in window && window.caches) {
      try {
        await Promise.all([
          window.caches.delete('supabase-auth'),
          window.caches.delete('pages'),
        ]);
      } catch (cacheErr) {
        console.warn('[userStore] Failed to purge window.caches', cacheErr);
      }
    }

    // 4. Dispatch PURGE_AUTH_CACHE message to Service Worker with null-controller safety
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker) {
      try {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'PURGE_AUTH_CACHE' });
        } else if (navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.active?.postMessage({ type: 'PURGE_AUTH_CACHE' });
          }).catch(() => {});
        }
      } catch (swErr) {
        console.warn('[userStore] Failed to dispatch PURGE_AUTH_CACHE to serviceWorker', swErr);
      }
    }

    // 5. Reset other Zustand stores
    useVisitStore.getState().reset?.();
    useTripStore.getState().reset?.();
    useFriendStore.getState().reset?.();
    useWineryStore.getState().reset?.();
    useMapStore.getState().reset?.();
    useUIStore.getState().reset?.();
    get().reset();
  },

  reset: () => set({ user: null, isLoading: false }),
}));

if (typeof window !== 'undefined') {
  (window as any).useUserStore = useUserStore;
}
