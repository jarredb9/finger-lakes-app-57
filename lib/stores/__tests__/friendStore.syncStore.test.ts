import { act } from '@testing-library/react';
import { useFriendStore } from '../friendStore';
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

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
    },
    rpc: jest.fn(),
  })),
}));

describe('friendStore SyncStore integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useFriendStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue send_request mutation in SyncStore when offline', async () => {
    const email = 'test@example.com';

    await act(async () => {
      await useFriendStore.getState().addFriend(email);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'social_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'send_request',
        email: 'test@example.com',
      })
    }));
  });

  it('should enqueue respond mutation in SyncStore when offline', async () => {
    const requesterId = 'r123';

    await act(async () => {
      await useFriendStore.getState().acceptFriend(requesterId);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'social_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'respond',
        requesterId: 'r123',
        accept: true,
      })
    }));
  });

  it('should enqueue remove mutation in SyncStore when offline', async () => {
    const friendId = 'f123';

    await act(async () => {
      await useFriendStore.getState().removeFriend(friendId);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'social_action',
      userId: 'user-123',
      payload: expect.objectContaining({
        action: 'remove',
        friendId: 'f123',
      })
    }));
  });
});
