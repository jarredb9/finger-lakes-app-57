import { act } from '@testing-library/react';
import { useUserStore } from '../userStore';
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

jest.mock('@/lib/services/profileService', () => ({
  ProfileService: {
    updatePrivacyLevel: jest.fn(),
  },
}));

describe('userStore SyncStore integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useUserStore.getState().reset();
    useUserStore.setState({ user: { id: 'user-123', name: 'Tester', email: 'test@mail.com' } as any });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue update_profile mutation in SyncStore when offline', async () => {
    await act(async () => {
      await useUserStore.getState().updatePrivacyLevel('private');
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'update_profile',
      userId: 'user-123',
      payload: expect.objectContaining({
        type: 'privacy',
        level: 'private',
      })
    }));
  });
});
