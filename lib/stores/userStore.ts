import { createWithEqualityFn } from 'zustand/traditional';
import { createClient } from '@/utils/supabase/client';
import { ProfileService } from '@/lib/services/profileService';

export interface User {
  id: string;
  name: string;
  email: string;
  privacy_level?: 'public' | 'friends_only' | 'private';
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  fetchUser: () => Promise<void>;
  updatePrivacyLevel: (level: 'public' | 'friends_only' | 'private') => Promise<void>;
  logout: () => Promise<void>;
  reset: () => void;
}

export const useUserStore = createWithEqualityFn<UserState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  fetchUser: async () => {
    set({ isLoading: true });
    const supabase = createClient();
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (!authUser || authError) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Defer to Service for profile fetching with retry logic
      const profile = await ProfileService.fetchProfile(authUser.id);

      const formattedUser: User = {
          id: authUser.id,
          name: profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
          email: profile?.email || authUser.email || '',
          privacy_level: profile?.privacy_level || 'public'
      };

      set({ user: formattedUser, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error('[UserStore] fetchUser exception:', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updatePrivacyLevel: async (level) => {
    const currentUser = get().user;
    if (!currentUser) return;

    try {
      // Defer to Service for atomic update
      await ProfileService.updatePrivacyLevel(level);

      set({
        user: { ...currentUser, privacy_level: level }
      });
    } catch (error) {
      console.error('Failed to update privacy level', error);
      throw error;
    }
  },

  logout: async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
      set({ user: null, isAuthenticated: false });
    } catch (error) {
      console.error('Logout failed', error);
    }
  },

  reset: () => set({
    user: null,
    isAuthenticated: false,
    isLoading: false, // Default to false for test isolation
  }),
}));

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useUserStore = useUserStore;
}
