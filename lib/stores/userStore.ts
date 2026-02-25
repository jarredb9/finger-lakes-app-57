import { createWithEqualityFn } from 'zustand/traditional';
import { createClient } from '@/utils/supabase/client';

interface User {
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

      // Retry logic for profile fetching (handles E2E race conditions)
      let profile = null;
      let retries = 5;
      
      while (retries > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, email, privacy_level')
          .eq('id', authUser.id)
          .single();

        if (!error && data) {
          profile = data;
          break;
        }
        
        if (retries > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        retries--;
      }

      const formattedUser: User = {
          id: authUser.id,
          name: profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
          email: profile?.email || authUser.email || '',
          privacy_level: profile?.privacy_level || 'friends_only'
      };

      set({ user: formattedUser, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error('[UserStore] fetchUser exception:', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updatePrivacyLevel: async (level) => {
    const supabase = createClient();
    const currentUser = get().user;
    if (!currentUser) return;

    try {
      // Use RPC for consistent behavior as defined in migration
      const { error } = await supabase.rpc('update_profile_privacy', {
        p_privacy_level: level
      });

      if (error) throw error;

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
