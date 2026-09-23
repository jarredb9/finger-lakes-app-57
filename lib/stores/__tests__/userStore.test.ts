import { act } from '@testing-library/react';
import { useUserStore } from '../userStore';
import { useSyncStore } from '../syncStore';
import { useVisitStore } from '../visitStore';
import { useTripStore } from '../tripStore';
import { useFriendStore } from '../friendStore';
import { useWineryStore } from '../wineryStore';
import { useMapStore } from '../mapStore';
import { useUIStore } from '../uiStore';

let mockGetUser = jest.fn();
let mockGetSession = jest.fn();
let mockSignOut = jest.fn();
let mockFrom = jest.fn();
let mockRpc = jest.fn();

(globalThis as any)._USER_MOCKS = {
  mockGetUser,
  mockGetSession,
  mockSignOut,
  mockFrom,
  mockRpc,
};

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: (...args: any[]) => (globalThis as any)._USER_MOCKS.mockGetUser(...args),
      getSession: (...args: any[]) => (globalThis as any)._USER_MOCKS.mockGetSession(...args),
      signOut: (...args: any[]) => (globalThis as any)._USER_MOCKS.mockSignOut(...args),
    },
    from: (...args: any[]) => (globalThis as any)._USER_MOCKS.mockFrom(...args),
    rpc: (...args: any[]) => (globalThis as any)._USER_MOCKS.mockRpc(...args),
  })),
}));

describe('UserStore Logic', () => {
  beforeEach(() => {
    mockGetUser = jest.fn().mockResolvedValue({ 
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null
    });
    mockGetSession = jest.fn().mockResolvedValue({ 
      data: { session: { user: { id: 'user-123', email: 'test@example.com' } } },
      error: null
    });
    mockSignOut = jest.fn().mockResolvedValue({ error: null });
    mockFrom = jest.fn(() => ({
      select: () => ({
        eq: () => ({
          single: jest.fn().mockResolvedValue({
            data: { 
              id: 'user-123', 
              name: 'Test User', 
              email: 'test@example.com',
              privacy_level: 'friends_only',
              ai_enabled: false
            },
            error: null
          })
        })
      }),
      update: () => ({
        eq: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    }));
    mockRpc = jest.fn().mockResolvedValue({ data: { success: true }, error: null });

    (globalThis as any)._USER_MOCKS = {
      mockGetUser,
      mockGetSession,
      mockSignOut,
      mockFrom,
      mockRpc,
    };

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
      writable: true,
    });

    useUserStore.getState().reset();
  });

  it('should fetch user with ai_enabled defaulting to false', async () => {
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });

    const user = useUserStore.getState().user;
    expect(user).toBeDefined();
    expect(user?.id).toBe('user-123');
    expect(user?.privacy_level).toBe('friends_only');
    expect(user?.ai_enabled).toBe(false);
    expect(useUserStore.getState().user).not.toBeNull();
  });

  it('should update privacy level optimistically', async () => {
    // First fetch user
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });

    await act(async () => {
      await useUserStore.getState().updatePrivacyLevel('public');
    });

    const user = useUserStore.getState().user;
    expect(user?.privacy_level).toBe('public');
  });

  it('should update ai_enabled setting optimistically', async () => {
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });

    expect(useUserStore.getState().user?.ai_enabled).toBe(false);

    await act(async () => {
      await useUserStore.getState().updateAIEnabled(true);
    });

    expect(useUserStore.getState().user?.ai_enabled).toBe(true);

    await act(async () => {
      await useUserStore.getState().updateAIEnabled(false);
    });

    expect(useUserStore.getState().user?.ai_enabled).toBe(false);
  });

  it('should reset user state', async () => {
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });
    
    expect(useUserStore.getState().user).not.toBeNull();

    act(() => {
      useUserStore.getState().reset();
    });

    expect(useUserStore.getState().user).toBeNull();
  });

  it('should await syncStore reset and reset all other stores on logout', async () => {
    const mockSyncReset = jest.fn().mockResolvedValue(undefined);
    const mockVisitReset = jest.fn();
    const mockTripReset = jest.fn();
    const mockFriendReset = jest.fn();
    const mockWineryReset = jest.fn();
    const mockMapReset = jest.fn();
    const mockUIReset = jest.fn();

    useSyncStore.getState().reset = mockSyncReset;
    useVisitStore.getState().reset = mockVisitReset;
    useTripStore.getState().reset = mockTripReset;
    useFriendStore.getState().reset = mockFriendReset;
    useWineryStore.getState().reset = mockWineryReset;
    useMapStore.getState().reset = mockMapReset;
    useUIStore.getState().reset = mockUIReset;

    await act(async () => {
      await useUserStore.getState().logout();
    });

    expect(mockSyncReset).toHaveBeenCalled();
    expect(mockVisitReset).toHaveBeenCalled();
    expect(mockTripReset).toHaveBeenCalled();
    expect(mockFriendReset).toHaveBeenCalled();
    expect(mockWineryReset).toHaveBeenCalled();
    expect(mockMapReset).toHaveBeenCalled();
    expect(mockUIReset).toHaveBeenCalled();
  });

  describe('Phase 7 Task 1: Offline session preservation in fetchUser (FM-7.1)', () => {
    it('should fall back to supabase.auth.getSession() when offline (navigator.onLine === false) without losing user identity', async () => {
      mockGetUser = jest.fn().mockRejectedValue(new TypeError('Failed to fetch (NetworkOnly / Offline)'));
      mockGetSession = jest.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'offline-user-789',
              email: 'offline@winery.com',
              user_metadata: { full_name: 'Offline Explorer' },
            },
          },
        },
        error: null,
      });

      mockFrom = jest.fn(() => ({
        select: () => ({
          eq: () => ({
            single: jest.fn().mockRejectedValue(new Error('Offline - network unavailable')),
          }),
        }),
      }));

      (globalThis as any)._USER_MOCKS = {
        mockGetUser,
        mockGetSession,
        mockSignOut,
        mockFrom,
        mockRpc,
      };

      // Simulate offline network state
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false,
        writable: true,
      });

      useUserStore.getState().reset();

      await act(async () => {
        await useUserStore.getState().fetchUser();
      });

      // Assert getSession was invoked as a fallback
      expect(mockGetSession).toHaveBeenCalled();

      // Assert user identity was preserved from session rather than wiped to null
      const currentUser = useUserStore.getState().user;
      expect(currentUser).not.toBeNull();
      expect(currentUser?.id).toBe('offline-user-789');
      expect(currentUser?.email).toBe('offline@winery.com');
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('should fall back to getSession() when getUser() throws a network error even if onLine is true', async () => {
      mockGetUser = jest.fn().mockRejectedValue(new Error('Network request failed'));
      mockGetSession = jest.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'network-err-user',
              email: 'network@winery.com',
            },
          },
        },
        error: null,
      });

      mockFrom = jest.fn(() => ({
        select: () => ({
          eq: () => ({
            single: jest.fn().mockRejectedValue(new Error('Network error')),
          }),
        }),
      }));

      (globalThis as any)._USER_MOCKS = {
        mockGetUser,
        mockGetSession,
        mockSignOut,
        mockFrom,
        mockRpc,
      };

      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      useUserStore.getState().reset();

      await act(async () => {
        await useUserStore.getState().fetchUser();
      });

      expect(mockGetSession).toHaveBeenCalled();
      expect(useUserStore.getState().user?.id).toBe('network-err-user');
    });

    it('should set user to null if both getUser() and getSession() return no user/session', async () => {
      mockGetUser = jest.fn().mockResolvedValue({ data: { user: null }, error: null });
      mockGetSession = jest.fn().mockResolvedValue({ data: { session: null }, error: null });

      (globalThis as any)._USER_MOCKS = {
        mockGetUser,
        mockGetSession,
        mockSignOut,
        mockFrom,
        mockRpc,
      };

      useUserStore.setState({ user: { id: 'previous-user', email: 'old@example.com' } });

      await act(async () => {
        await useUserStore.getState().fetchUser();
      });

      expect(useUserStore.getState().user).toBeNull();
      expect(useUserStore.getState().isLoading).toBe(false);
    });
  });

  describe('Phase 7 Task 1: Offline-resilient logout, CacheStorage purge & SW messaging (FM-7.2)', () => {
    it('should purge supabase-auth and pages from window.caches and dispatch PURGE_AUTH_CACHE to serviceWorker', async () => {
      const mockDelete = jest.fn().mockResolvedValue(true);
      const mockPostMessage = jest.fn();

      // Mock window.caches
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: {
          delete: mockDelete,
          keys: jest.fn().mockResolvedValue(['supabase-auth', 'pages', 'static-assets']),
        },
        writable: true,
      });

      // Mock navigator.serviceWorker
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          controller: {
            postMessage: mockPostMessage,
          },
          ready: Promise.resolve({
            active: { postMessage: mockPostMessage },
          }),
        },
        writable: true,
      });

      mockSignOut = jest.fn().mockResolvedValue({ error: null });
      (globalThis as any)._USER_MOCKS.mockSignOut = mockSignOut;

      useUserStore.setState({ user: { id: 'active-user', email: 'active@example.com' } });

      await act(async () => {
        await useUserStore.getState().logout();
      });

      // Asserts CacheStorage purge was attempted
      expect(mockDelete).toHaveBeenCalledWith('supabase-auth');
      expect(mockDelete).toHaveBeenCalledWith('pages');

      // Asserts Service Worker received PURGE_AUTH_CACHE message
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PURGE_AUTH_CACHE' })
      );

      // Asserts local store reset
      expect(useUserStore.getState().user).toBeNull();
    });

    it('should handle null navigator.serviceWorker.controller safely without throwing TypeError', async () => {
      // Controller is null on first visit, incognito, or hard refresh
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          controller: null,
          ready: Promise.resolve({ active: null }),
        },
        writable: true,
      });

      useSyncStore.getState().reset = jest.fn().mockResolvedValue(undefined as any);
      mockSignOut = jest.fn().mockResolvedValue({ error: null });
      (globalThis as any)._USER_MOCKS.mockSignOut = mockSignOut;

      useUserStore.setState({ user: { id: 'null-sw-user', email: 'sw@example.com' } });

      // Should complete without throwing "Cannot read properties of null (reading 'postMessage')"
      await act(async () => {
        await useUserStore.getState().logout();
      });

      expect(useUserStore.getState().user).toBeNull();
    });

    it('should complete logout without error when window.caches or navigator.serviceWorker is undefined', async () => {
      // Simulate SSR or stripped Node environment
      const originalCaches = (window as any).caches;
      const originalSW = (navigator as any).serviceWorker;

      delete (window as any).caches;
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: undefined,
        writable: true,
      });

      useSyncStore.getState().reset = jest.fn().mockResolvedValue(undefined as any);
      mockSignOut = jest.fn().mockResolvedValue({ error: null });
      (globalThis as any)._USER_MOCKS.mockSignOut = mockSignOut;

      useUserStore.setState({ user: { id: 'no-sw-user', email: 'nosw@example.com' } });

      await act(async () => {
        await useUserStore.getState().logout();
      });

      expect(useUserStore.getState().user).toBeNull();

      // Restore
      if (originalCaches) (window as any).caches = originalCaches;
      if (originalSW) Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalSW, writable: true });
    });

    it('should complete store reset even when supabase.auth.signOut() rejects (e.g. offline)', async () => {
      const mockSyncReset = jest.fn().mockResolvedValue(undefined);
      const mockVisitReset = jest.fn();
      const mockTripReset = jest.fn();
      const mockFriendReset = jest.fn();
      const mockWineryReset = jest.fn();
      const mockMapReset = jest.fn();
      const mockUIReset = jest.fn();

      useSyncStore.getState().reset = mockSyncReset;
      useVisitStore.getState().reset = mockVisitReset;
      useTripStore.getState().reset = mockTripReset;
      useFriendStore.getState().reset = mockFriendReset;
      useWineryStore.getState().reset = mockWineryReset;
      useMapStore.getState().reset = mockMapReset;
      useUIStore.getState().reset = mockUIReset;

      // Supabase signOut fails when network is severed
      mockSignOut = jest.fn().mockRejectedValue(new Error('Network error during sign out'));
      (globalThis as any)._USER_MOCKS.mockSignOut = mockSignOut;

      useUserStore.setState({ user: { id: 'offline-signout-user', email: 'offline@example.com' } });

      // Must catch error defensively and still wipe state across stores
      await act(async () => {
        await useUserStore.getState().logout();
      });

      expect(mockSyncReset).toHaveBeenCalled();
      expect(mockVisitReset).toHaveBeenCalled();
      expect(mockTripReset).toHaveBeenCalled();
      expect(mockFriendReset).toHaveBeenCalled();
      expect(mockWineryReset).toHaveBeenCalled();
      expect(mockMapReset).toHaveBeenCalled();
      expect(mockUIReset).toHaveBeenCalled();
      expect(useUserStore.getState().user).toBeNull();
    });
  });
});
