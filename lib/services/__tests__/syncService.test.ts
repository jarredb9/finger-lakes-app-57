import { SyncService } from '../syncService';
import { useSyncStore } from '@/lib/stores/syncStore';
import { createClient } from '@/utils/supabase/client';

// Mock dependencies
jest.mock('@/lib/stores/syncStore');
jest.mock('@/utils/supabase/client');
jest.mock('@/lib/utils/crypto', () => ({
  encrypt: jest.fn((p) => Promise.resolve(`encrypted-${JSON.stringify(p)}`)),
  decrypt: jest.fn((p) => Promise.resolve(JSON.parse(p.replace('encrypted-', '')))),
}));

describe('SyncService', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (SyncService as any).isSyncing = false;

    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } }, error: null }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    
    // Mock useSyncStore.getState()
    (useSyncStore.getState as jest.Mock).mockReturnValue({
      queue: [],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn(),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn(),
    });
  });

  it('should not sync if already syncing', async () => {
    // Setup: SyncService starts with isSyncing = false
    // We'll mock useSyncStore.getState() to return an empty queue
    (useSyncStore.getState as jest.Mock).mockReturnValue({
      queue: [],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn(),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn(),
    });

    const syncPromise1 = SyncService.sync();
    const syncPromise2 = SyncService.sync();

    await Promise.all([syncPromise1, syncPromise2]);
  });

  it('should replay mutations in the queue (Upload First)', async () => {
    const mockMutation = {
      id: 'sync-1',
      type: 'log_visit',
      encryptedPayload: 'encrypted-{"visit_date":"2023-01-01","user_review":"Great","rating":5,"wineryDbId":123}',
      createdAt: new Date().toISOString(),
      userId: 'test-user-id',
    };

    const mockSyncStore = {
      queue: [mockMutation],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({
        visit_date: '2023-01-01',
        user_review: 'Great',
        rating: 5,
        wineryDbId: 123,
      }),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    await SyncService.sync();

    // Verify RPC was called with decrypted payload
    expect(mockSupabase.rpc).toHaveBeenCalledWith('log_visit', expect.objectContaining({
      p_visit_data: expect.objectContaining({
        visit_date: '2023-01-01',
        user_review: 'Great',
      }),
    }));

    // Verify mutation was removed from queue
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-1');
  });

  it('should handle update_trip mutations', async () => {
    const mockMutation = {
      id: 'sync-trip-update',
      type: 'update_trip',
      encryptedPayload: 'encrypted-{"tripId":"456","updates":{"name":"Updated Trip"}}',
      userId: 'test-user-id',
    };

    const mockSyncStore = {
      queue: [mockMutation],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({
        tripId: '456',
        updates: { name: 'Updated Trip' }
      }),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    // Mock supabase.from('trips').update().eq()
    const mockUpdate = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockResolvedValue({ error: null });
    mockSupabase.from = jest.fn().mockReturnValue({
        update: mockUpdate,
        eq: mockEq
    });

    await SyncService.sync();

    expect(mockSupabase.from).toHaveBeenCalledWith('trips');
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Updated Trip' });
    expect(mockEq).toHaveBeenCalledWith('id', '456');
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-trip-update');
  });

  it('should handle delete_trip mutations', async () => {
    const mockMutation = {
      id: 'sync-trip-delete',
      type: 'delete_trip',
      encryptedPayload: 'encrypted-{"tripId":"456"}',
      userId: 'test-user-id',
    };

    const mockSyncStore = {
      queue: [mockMutation],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({ tripId: '456' }),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    await SyncService.sync();

    expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_trip', { p_trip_id: 456 });
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-trip-delete');
  });

  it('should handle update_profile mutations', async () => {
    const mockMutation = {
      id: 'sync-profile',
      type: 'update_profile',
      encryptedPayload: 'encrypted-{"type":"privacy","level":"friends_only"}',
      userId: 'test-user-id',
    };

    const mockSyncStore = {
      queue: [mockMutation],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({ type: 'privacy', level: 'friends_only' }),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    await SyncService.sync();

    expect(mockSupabase.rpc).toHaveBeenCalledWith('update_profile_privacy', { p_privacy_level: 'friends_only' });
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-profile');
  });

  it('should handle social_action mutations (send_request)', async () => {
    const mockMutation = {
      id: 'sync-social',
      type: 'social_action',
      encryptedPayload: 'encrypted-{"action":"send_request","email":"friend@example.com"}',
      userId: 'test-user-id',
    };

    const mockSyncStore = {
      queue: [mockMutation],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({ action: 'send_request', email: 'friend@example.com' }),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    await SyncService.sync();

    expect(mockSupabase.rpc).toHaveBeenCalledWith('send_friend_request', { target_email: 'friend@example.com' });
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-social');
  });

  it('should continue replaying if a mutation fails', async () => {
    const mockMutation1 = { id: 'sync-1', type: 'log_visit', userId: 'test-user-id', status: 'pending' };
    const mockMutation2 = { id: 'sync-2', type: 'log_visit', userId: 'test-user-id', status: 'pending' };

    const mockSyncStore = {
      queue: [mockMutation1, mockMutation2],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({}),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    // Mock first RPC call to fail
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network Error' } });

    await SyncService.sync();

    // Verify both RPCs were called (non-blocking)
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);

    // Verify first mutation was NOT removed but marked as error
    expect(mockSyncStore.removeMutation).toHaveBeenCalledTimes(1);
    expect(mockSyncStore.removeMutation).not.toHaveBeenCalledWith('sync-1');
    expect(mockSyncStore.updateMutationStatus).toHaveBeenCalledWith('sync-1', 'error');
  });

  it('should trigger sync when the window online event fires', async () => {
    const syncSpy = jest.spyOn(SyncService, 'sync').mockImplementation(() => Promise.resolve());
    
    // Simulate the online event
    window.dispatchEvent(new Event('online'));
    
    expect(syncSpy).toHaveBeenCalled();
    syncSpy.mockRestore();
  });
});
