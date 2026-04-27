import { act } from '@testing-library/react';

describe('userStore SyncStore integration', () => {
  let useUserStore: any;
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

    jest.doMock('@/lib/services/profileService', () => ({
      ProfileService: {
        updatePrivacyLevel: jest.fn(),
      },
    }));

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useUserStore = require('../userStore').useUserStore;
    useSyncStore = require('@/lib/stores/syncStore').useSyncStore;
    
    useUserStore.getState().reset();
    useUserStore.setState({ user: { id: 'user-123', name: 'Tester', email: 'test@mail.com' } });
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
        level: 'private'
      })
    }));
  });
});
