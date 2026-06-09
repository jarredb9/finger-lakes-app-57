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
                  privacy_level: 'friends_only'
                },
                error: null
              })
            })
          })
        }),
        rpc: jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
      }),
    }));

    // Re-require store after mocks
    useUserStore = require('../userStore').useUserStore;
    useUserStore.getState().reset();
  });

  it('should fetch user with privacy level', async () => {
    await act(async () => {
      await useUserStore.getState().fetchUser();
    });

    const user = useUserStore.getState().user;
    expect(user).toBeDefined();
    expect(user.id).toBe('user-123');
    expect(user.privacy_level).toBe('friends_only');
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
    jest.doMock('../wineryDataStore', () => ({
      useWineryDataStore: { getState: () => ({ reset: mockGenericReset }) }
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
    expect(mockGenericReset).toHaveBeenCalledTimes(7); // Remaining 7 stores (UserStore itself is reset via get().reset())
  });
});
