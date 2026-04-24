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

    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } }, error: null }),
      },
      rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  it('should not sync if already syncing', async () => {
    // Setup: SyncService starts with isSyncing = false
    // We'll mock useSyncStore.getState() to return an empty queue
    (useSyncStore.getState as jest.Mock).mockReturnValue({
      queue: [],
      removeMutation: jest.fn(),
      getDecryptedPayload: jest.fn(),
    });

    const syncPromise1 = SyncService.sync();
    const syncPromise2 = SyncService.sync();

    await Promise.all([syncPromise1, syncPromise2]);

    // If it was already syncing, useSyncStore.getState should have been called twice (once for each sync call)
    // but the actual sync logic (checking queue) should only happen if not already syncing.
    // We'll refine this test once we have implementation details.
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
      removeMutation: jest.fn().mockResolvedValue(undefined),
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

  it('should stop replaying if a mutation fails (atomic-ish)', async () => {
    const mockMutation1 = { id: 'sync-1', type: 'log_visit', userId: 'test-user-id' };
    const mockMutation2 = { id: 'sync-2', type: 'log_visit', userId: 'test-user-id' };

    const mockSyncStore = {
      queue: [mockMutation1, mockMutation2],
      removeMutation: jest.fn().mockResolvedValue(undefined),
      getDecryptedPayload: jest.fn().mockResolvedValue({}),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    // Mock first RPC call to fail
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network Error' } });

    await SyncService.sync();

    // Verify first RPC was called
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

    // Verify first mutation was NOT removed
    expect(mockSyncStore.removeMutation).not.toHaveBeenCalled();
  });
});
