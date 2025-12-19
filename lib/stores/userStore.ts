import { createWithEqualityFn } from 'zustand/traditional';

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
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const user = await response.json();
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to fetch user', error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
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
