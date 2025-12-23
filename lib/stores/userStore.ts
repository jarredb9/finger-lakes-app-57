import { createWithEqualityFn } from 'zustand/traditional';
import { createClient } from '@/utils/supabase/client';

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useUserStore = createWithEqualityFn<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  fetchUser: async () => {
    set({ isLoading: true });
    const supabase = createClient();
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        // Map Supabase user to our internal User interface
        const formattedUser: User = {
            id: user.id,
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            email: user.email || ''
        };
        set({ user: formattedUser, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to fetch user', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
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
}));

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useUserStore = useUserStore;
}
