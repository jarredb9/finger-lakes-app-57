import { act } from '@testing-library/react';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';
import { useWineryStore } from '../wineryStore';
import { useSyncStore } from '@/lib/stores/syncStore';

const mockAddMutation = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: mockAddMutation,
      queue: [],
      initialize: jest.fn(),
    })),
  },
}));

jest.mock('@/lib/services/wineryService', () => ({
  WineryService: {
    toggleFavorite: jest.fn(),
    toggleWishlist: jest.fn(),
    toggleFavoritePrivacy: jest.fn(),
    toggleWishlistPrivacy: jest.fn(),
    ensureInDb: jest.fn(),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
    },
  })),
}));

describe('wineryDataStore SyncStore integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useWineryStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue toggle_favorite mutation in SyncStore when offline', async () => {
    const winery = createMockWinery({ id: 'w1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Test Winery' });
    useWineryStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryStore.getState().toggleFavorite('w1');
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
    useWineryStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryStore.getState().toggleWishlist('w1');
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
    useWineryStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryStore.getState().toggleFavoritePrivacy('w1');
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
    useWineryStore.setState({ persistentWineries: [winery] });

    await act(async () => {
      await useWineryStore.getState().toggleWishlistPrivacy('w1');
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
