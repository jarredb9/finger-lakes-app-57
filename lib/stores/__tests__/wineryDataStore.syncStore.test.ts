import { act } from '@testing-library/react';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

describe('wineryDataStore SyncStore integration', () => {
  let useWineryDataStore: any;
  let useSyncStore: any;

  beforeEach(() => {
    jest.resetModules();

    // Mock SyncStore
    const mockAddMutation = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@/lib/stores/syncStore', () => ({
      useSyncStore: {
        getState: jest.fn(() => ({
          addMutation: mockAddMutation,
          queue: [],
          initialize: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/lib/services/wineryService', () => ({
      WineryService: {
        toggleFavorite: jest.fn(),
        toggleWishlist: jest.fn(),
        toggleFavoritePrivacy: jest.fn(),
        toggleWishlistPrivacy: jest.fn(),
        ensureInDb: jest.fn(),
      },
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        auth: {
          getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
        },
      })),
    }));

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useWineryDataStore = require('../wineryDataStore').useWineryDataStore;
    useSyncStore = require('@/lib/stores/syncStore').useSyncStore;
    
    useWineryDataStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue toggle_favorite mutation in SyncStore when offline', async () => {
    const winery = createMockWinery({ id: 'w1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Test Winery' });
    useWineryDataStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryDataStore.getState().toggleFavorite('w1');
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'winery_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'toggle_favorite',
        wineryId: 'w1'
      })
    }));
  });

  it('should enqueue toggle_wishlist mutation in SyncStore when offline', async () => {
    const winery = createMockWinery({ id: 'w1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Test Winery' });
    useWineryDataStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryDataStore.getState().toggleWishlist('w1');
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'winery_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'toggle_wishlist',
        wineryId: 'w1'
      })
    }));
  });

  it('should enqueue toggle_favorite_privacy mutation in SyncStore when offline', async () => {
    const winery = createMockWinery({ id: 'w1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Test Winery' });
    useWineryDataStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryDataStore.getState().toggleFavoritePrivacy('w1');
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'winery_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'toggle_favorite_privacy',
        wineryDbId: 101
      })
    }));
  });

  it('should enqueue toggle_wishlist_privacy mutation in SyncStore when offline', async () => {
    const winery = createMockWinery({ id: 'w1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Test Winery' });
    useWineryDataStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryDataStore.getState().toggleWishlistPrivacy('w1');
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'winery_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'toggle_wishlist_privacy',
        wineryDbId: 101
      })
    }));
  });
});
