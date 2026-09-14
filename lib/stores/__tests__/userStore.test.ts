import { act } from '@testing-library/react';

describe('UserStore Logic', () => {
  let useUserStore: any;

  beforeEach(() => {
    jest.resetModules();

    // Mock Supabase
    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        auth: {
          getUser: jest.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123', email: 'test@example.com' } },
            error: null
          }),
          signOut: jest.fn().mockResolvedValue({ error: null }),
        },
        from: () => ({
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
        }),
        rpc: jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
      }),
    }));

    // Re-require store after mocks
    useUserStore = require('../userStore').useUserStore;
    useUserStore.getState().reset();
  });

  it('should fetch user with ai_enabled defaulting to false', async () => {
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });

    const user = useUserStore.getState().user;
    expect(user).toBeDefined();
    expect(user.id).toBe('user-123');
    expect(user.privacy_level).toBe('friends_only');
    expect(user.ai_enabled).toBe(false);
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
    expect(user.privacy_level).toBe('public');
  });

  it('should update ai_enabled setting optimistically', async () => {
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });

    expect(useUserStore.getState().user.ai_enabled).toBe(false);

    await act(async () => {
      await useUserStore.getState().updateAIEnabled(true);
    });

    expect(useUserStore.getState().user.ai_enabled).toBe(true);

    await act(async () => {
      await useUserStore.getState().updateAIEnabled(false);
    });

    expect(useUserStore.getState().user.ai_enabled).toBe(false);
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
    jest.resetModules();

    // Redefine Supabase client mock since resetModules cleared it
    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({
        auth: {
          signOut: jest.fn().mockResolvedValue({ error: null }),
        },
      }),
    }));

    const mockSyncReset = jest.fn().mockResolvedValue(undefined);
    const mockGenericReset = jest.fn();

    jest.doMock('../syncStore', () => ({
      useSyncStore: { getState: () => ({ reset: mockSyncReset }) }
    }));
    jest.doMock('../visitStore', () => ({
      useVisitStore: { getState: () => ({ reset: mockGenericReset }) }
    }));
    jest.doMock('../tripStore', () => ({
      useTripStore: { getState: () => ({ reset: mockGenericReset }) }
    }));
    jest.doMock('../friendStore', () => ({
      useFriendStore: { getState: () => ({ reset: mockGenericReset }) }
    }));
    jest.doMock('../wineryStore', () => ({
      useWineryStore: { getState: () => ({ reset: mockGenericReset }) }
    }));
    jest.doMock('../mapStore', () => ({
      useMapStore: { getState: () => ({ reset: mockGenericReset }) }
    }));
    jest.doMock('../uiStore', () => ({
      useUIStore: { getState: () => ({ reset: mockGenericReset }) }
    }));

    // Re-require userStore under these mocks
    const testUserStore = require('../userStore').useUserStore;

    await act(async () => {
      await testUserStore.getState().logout();
    });

    expect(mockSyncReset).toHaveBeenCalled();
    expect(mockGenericReset).toHaveBeenCalledTimes(6); // Remaining 6 stores (UserStore itself is reset via get().reset())
  });

  describe('Phase 7 Task 1: Offline session preservation in fetchUser (FM-7.1)', () => {
    it('should fall back to supabase.auth.getSession() when offline (navigator.onLine === false) without losing user identity', async () => {
      jest.resetModules();

      const mockGetUser = jest.fn().mockRejectedValue(new TypeError('Failed to fetch (NetworkOnly / Offline)'));
      const mockGetSession = jest.fn().mockResolvedValue({
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

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            getUser: mockGetUser,
            getSession: mockGetSession,
            signOut: jest.fn(),
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                single: jest.fn().mockRejectedValue(new Error('Offline - network unavailable')),
              }),
            }),
          }),
        }),
      }));

      // Simulate offline network state
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false,
        writable: true,
      });

      const store = require('../userStore').useUserStore;
      store.getState().reset();

      await act(async () => {
        await store.getState().fetchUser();
      });

      // Assert getSession was invoked as a fallback
      expect(mockGetSession).toHaveBeenCalled();

      // Assert user identity was preserved from session rather than wiped to null
      const currentUser = store.getState().user;
      expect(currentUser).not.toBeNull();
      expect(currentUser?.id).toBe('offline-user-789');
      expect(currentUser?.email).toBe('offline@winery.com');
      expect(store.getState().isLoading).toBe(false);
    });

    it('should fall back to getSession() when getUser() throws a network error even if onLine is true', async () => {
      jest.resetModules();

      const mockGetUser = jest.fn().mockRejectedValue(new Error('Network request failed'));
      const mockGetSession = jest.fn().mockResolvedValue({
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

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            getUser: mockGetUser,
            getSession: mockGetSession,
            signOut: jest.fn(),
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                single: jest.fn().mockRejectedValue(new Error('Network error')),
              }),
            }),
          }),
        }),
      }));

      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      const store = require('../userStore').useUserStore;
      store.getState().reset();

      await act(async () => {
        await store.getState().fetchUser();
      });

      expect(mockGetSession).toHaveBeenCalled();
      expect(store.getState().user?.id).toBe('network-err-user');
    });

    it('should set user to null if both getUser() and getSession() return no user/session', async () => {
      jest.resetModules();

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
            getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
            signOut: jest.fn(),
          },
        }),
      }));

      const store = require('../userStore').useUserStore;
      store.setState({ user: { id: 'previous-user', email: 'old@example.com' } });

      await act(async () => {
        await store.getState().fetchUser();
      });

      expect(store.getState().user).toBeNull();
      expect(store.getState().isLoading).toBe(false);
    });
  });

  describe('Phase 7 Task 1: Offline-resilient logout, CacheStorage purge & SW messaging (FM-7.2)', () => {
    it('should purge supabase-auth and pages from window.caches and dispatch PURGE_AUTH_CACHE to serviceWorker', async () => {
      jest.resetModules();

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

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            signOut: jest.fn().mockResolvedValue({ error: null }),
          },
        }),
      }));

      const store = require('../userStore').useUserStore;
      store.setState({ user: { id: 'active-user', email: 'active@example.com' } });

      await act(async () => {
        await store.getState().logout();
      });

      // Asserts CacheStorage purge was attempted
      expect(mockDelete).toHaveBeenCalledWith('supabase-auth');
      expect(mockDelete).toHaveBeenCalledWith('pages');

      // Asserts Service Worker received PURGE_AUTH_CACHE message
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PURGE_AUTH_CACHE' })
      );

      // Asserts local store reset
      expect(store.getState().user).toBeNull();
    });

    it('should handle null navigator.serviceWorker.controller safely without throwing TypeError', async () => {
      jest.resetModules();

      // Controller is null on first visit, incognito, or hard refresh
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          controller: null,
          ready: Promise.resolve({ active: null }),
        },
        writable: true,
      });

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            signOut: jest.fn().mockResolvedValue({ error: null }),
          },
        }),
      }));

      const store = require('../userStore').useUserStore;
      store.setState({ user: { id: 'null-sw-user', email: 'sw@example.com' } });

      // Should complete without throwing "Cannot read properties of null (reading 'postMessage')"
      await expect(
        act(async () => {
          await store.getState().logout();
        })
      ).resolves.not.toThrow();

      expect(store.getState().user).toBeNull();
    });

    it('should complete logout without error when window.caches or navigator.serviceWorker is undefined', async () => {
      jest.resetModules();

      // Simulate SSR or stripped Node environment
      const originalCaches = (window as any).caches;
      const originalSW = (navigator as any).serviceWorker;

      delete (window as any).caches;
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: undefined,
        writable: true,
      });

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            signOut: jest.fn().mockResolvedValue({ error: null }),
          },
        }),
      }));

      const store = require('../userStore').useUserStore;
      store.setState({ user: { id: 'no-sw-user', email: 'nosw@example.com' } });

      await expect(
        act(async () => {
          await store.getState().logout();
        })
      ).resolves.not.toThrow();

      expect(store.getState().user).toBeNull();

      // Restore
      if (originalCaches) (window as any).caches = originalCaches;
      if (originalSW) Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalSW, writable: true });
    });

    it('should complete store reset even when supabase.auth.signOut() rejects (e.g. offline)', async () => {
      jest.resetModules();

      const mockSyncReset = jest.fn().mockResolvedValue(undefined);
      const mockGenericReset = jest.fn();

      jest.doMock('@/lib/stores/syncStore', () => ({
        useSyncStore: { getState: () => ({ reset: mockSyncReset }) },
      }));
      jest.doMock('@/lib/stores/visitStore', () => ({
        useVisitStore: { getState: () => ({ reset: mockGenericReset }) },
      }));
      jest.doMock('@/lib/stores/tripStore', () => ({
        useTripStore: { getState: () => ({ reset: mockGenericReset }) },
      }));
      jest.doMock('@/lib/stores/friendStore', () => ({
        useFriendStore: { getState: () => ({ reset: mockGenericReset }) },
      }));
      jest.doMock('@/lib/stores/wineryStore', () => ({
        useWineryStore: { getState: () => ({ reset: mockGenericReset }) },
      }));
      jest.doMock('@/lib/stores/mapStore', () => ({
        useMapStore: { getState: () => ({ reset: mockGenericReset }) },
      }));
      jest.doMock('@/lib/stores/uiStore', () => ({
        useUIStore: { getState: () => ({ reset: mockGenericReset }) },
      }));

      // Supabase signOut fails when network is severed
      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            signOut: jest.fn().mockRejectedValue(new Error('Network error during sign out')),
          },
        }),
      }));

      const store = require('../userStore').useUserStore;
      store.setState({ user: { id: 'offline-signout-user', email: 'offline@example.com' } });

      // Must catch error defensively and still wipe state across stores
      await act(async () => {
        await store.getState().logout();
      });

      expect(mockSyncReset).toHaveBeenCalled();
      expect(mockGenericReset).toHaveBeenCalledTimes(6);
      expect(store.getState().user).toBeNull();
    });
  });
});

