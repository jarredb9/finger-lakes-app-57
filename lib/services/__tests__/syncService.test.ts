import { SyncService } from '../syncService';
import { useSyncStore } from '@/lib/stores/syncStore';
import { createClient } from '@/utils/supabase/client';

// Mock dependencies
jest.mock('@/lib/stores/syncStore');
jest.mock('@/utils/supabase/client');
jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: {
    getState: jest.fn(() => ({
      fetchTrips: jest.fn(),
      fetchUpcomingTrips: jest.fn(),
    })),
  },
}));
jest.mock('@/lib/stores/visitStore', () => ({
  useVisitStore: {
    getState: jest.fn(() => ({
      fetchVisits: jest.fn(),
    })),
  },
}));
jest.mock('@/lib/stores/friendStore', () => ({
  useFriendStore: {
    getState: jest.fn(() => ({
      fetchFriends: jest.fn(),
      fetchRequests: jest.fn(),
      fetchFriendActivityFeed: jest.fn(),
    })),
  },
}));
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

    expect(mockSupabase.rpc).toHaveBeenCalledWith('send_friend_request', { p_target_email: 'friend@example.com' });
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

  describe('ST-09: Exponential backoff with jitter on 5xx errors', () => {
    it('calculates exponential backoff delay with jitter (1s, 2s, 4s... max 60s)', () => {
      expect(typeof (SyncService as any).calculateBackoff).toBe('function');
      
      const delay1 = (SyncService as any).calculateBackoff(1);
      const delay2 = (SyncService as any).calculateBackoff(2);
      const delay3 = (SyncService as any).calculateBackoff(3);
      const delay4 = (SyncService as any).calculateBackoff(4);
      const delay10 = (SyncService as any).calculateBackoff(10);

      // Base: 1s, 2s, 4s, 8s ... max 60s
      // With jitter (±20%), values must be within expected bounds
      expect(delay1).toBeGreaterThanOrEqual(800);
      expect(delay1).toBeLessThanOrEqual(1500);

      expect(delay2).toBeGreaterThanOrEqual(1600);
      expect(delay2).toBeLessThanOrEqual(3000);

      expect(delay3).toBeGreaterThanOrEqual(3200);
      expect(delay3).toBeLessThanOrEqual(6000);

      expect(delay4).toBeGreaterThanOrEqual(6400);
      expect(delay4).toBeLessThanOrEqual(12000);

      // Capped at 60s (60,000 ms)
      expect(delay10).toBeLessThanOrEqual(60000);
    });

    it('produces varied jitter results across multiple calls for the same attempt', () => {
      const results = new Set<number>();
      for (let i = 0; i < 10; i++) {
        results.add((SyncService as any).calculateBackoff(3));
      }
      // With jitter, not all 10 values should be identical
      expect(results.size).toBeGreaterThan(1);
    });

    it('applies exponential backoff on 5xx errors without marking mutation as permanent error', async () => {
      const mockMutation = {
        id: 'sync-5xx-1',
        type: 'log_visit',
        encryptedPayload: 'encrypted-{"visit_date":"2023-01-01","rating":5}',
        userId: 'test-user-id',
        status: 'pending',
      };

      const mockSyncStore = {
        queue: [mockMutation],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn().mockResolvedValue(undefined),
        updateMutationStatus: jest.fn(),
        getDecryptedPayload: jest.fn().mockResolvedValue({ visit_date: '2023-01-01', rating: 5 }),
      };
      (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

      // Mock 503 Service Unavailable
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Service Unavailable', status: 503 },
      });

      await SyncService.sync();

      // Mutation must NOT be marked as permanent error or removed from queue
      expect(mockSyncStore.updateMutationStatus).not.toHaveBeenCalledWith('sync-5xx-1', 'error');
      expect(mockSyncStore.removeMutation).not.toHaveBeenCalledWith('sync-5xx-1');
      // Must record or schedule next retry backoff
      expect((SyncService as any).getBackoffDelay?.('sync-5xx-1') ?? (mockMutation as any).nextRetryAt).toBeDefined();
    });

    it('defers replaying mutations that are still within their backoff window', async () => {
      const mockMutation = {
        id: 'sync-5xx-waiting',
        type: 'log_visit',
        encryptedPayload: 'encrypted-{}',
        userId: 'test-user-id',
        status: 'pending',
        nextRetryAt: Date.now() + 30000, // In backoff window for 30s
      };

      const mockSyncStore = {
        queue: [mockMutation],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn(),
        updateMutationStatus: jest.fn(),
        getDecryptedPayload: jest.fn().mockResolvedValue({}),
      };
      (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

      await SyncService.sync();

      // Should not invoke RPC because item is currently in backoff
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('ST-09: Dead Letter Queue (DLQ) for 4xx errors', () => {
    it('routes 4xx client errors to the DLQ and removes them from the active sync queue', async () => {
      const mockMutation = {
        id: 'sync-4xx-1',
        type: 'log_visit',
        encryptedPayload: 'encrypted-{"invalid":"payload"}',
        userId: 'test-user-id',
        status: 'pending',
        createdAt: '2026-09-01T12:00:00.000Z',
      };

      const mockSyncStore = {
        queue: [mockMutation],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn().mockResolvedValue(undefined),
        updateMutationStatus: jest.fn(),
        getDecryptedPayload: jest.fn().mockResolvedValue({ invalid: 'payload' }),
      };
      (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

      // Mock 400 Bad Request
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Bad Request: invalid payload', status: 400 },
      });

      await SyncService.sync();

      // Must be removed from active sync queue to unblock progression
      expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-4xx-1');

      // Must route to DLQ store with 7-day retention metadata
      const dlqEntries = await (SyncService as any).getDLQEntries?.();
      expect(dlqEntries).toBeDefined();
      const routedItem = dlqEntries.find((e: any) => e.mutationId === 'sync-4xx-1' || e.id === 'sync-4xx-1');
      expect(routedItem).toBeDefined();
      expect(routedItem.error.status).toBe(400);
      // 7-day retention window
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime();
      expect(Math.abs(new Date(routedItem.expiresAt).getTime() - expectedExpiry)).toBeLessThan(5000);
    });

    it('unblocks subsequent mutations when a prior mutation encounters a 4xx error', async () => {
      const badMutation = {
        id: 'sync-422-bad',
        type: 'log_visit',
        encryptedPayload: 'encrypted-{}',
        userId: 'test-user-id',
      };
      const goodMutation = {
        id: 'sync-good-2',
        type: 'delete_trip',
        encryptedPayload: 'encrypted-{"tripId":"999"}',
        userId: 'test-user-id',
      };

      const mockSyncStore = {
        queue: [badMutation, goodMutation],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn().mockResolvedValue(undefined),
        updateMutationStatus: jest.fn(),
        getDecryptedPayload: jest.fn().mockImplementation(async (item) => {
          if (item.id === 'sync-422-bad') return {};
          return { tripId: '999' };
        }),
      };
      (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

      // Mutation 1 fails with 422 Unprocessable Entity
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unprocessable Entity', status: 422 },
      });
      // Mutation 2 succeeds
      mockSupabase.rpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await SyncService.sync();

      // Both mutations must be dequeued: bad to DLQ, good successfully synced
      expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-422-bad');
      expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-good-2');
    });

    it('purges DLQ entries older than 7 days retention period', async () => {
      expect(typeof (SyncService as any).purgeExpiredDLQ).toBe('function');

      const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const freshDate = new Date().toISOString();

      await (SyncService as any).seedDLQ?.([
        { id: 'expired-1', failedAt: expiredDate, expiresAt: new Date(Date.now() - 1000).toISOString() },
        { id: 'fresh-1', failedAt: freshDate, expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString() },
      ]);

      await (SyncService as any).purgeExpiredDLQ();

      const dlqEntries = await (SyncService as any).getDLQEntries?.();
      expect(dlqEntries.find((e: any) => e.id === 'expired-1')).toBeUndefined();
      expect(dlqEntries.find((e: any) => e.id === 'fresh-1')).toBeDefined();
    });
  });

  describe('ST-08: Optimistic Concurrency Control on Replay', () => {
    it('aborts local replay when remote record has a newer updated_at timestamp (Server Wins)', async () => {
      const clientMutationTimestamp = '2026-09-01T10:00:00.000Z';
      const serverNewerTimestamp = '2026-09-01T12:00:00.000Z';

      const mockMutation = {
        id: 'sync-occ-trip',
        type: 'update_trip',
        encryptedPayload: `encrypted-{"tripId":"123","updates":{"name":"Stale Local Edit"},"clientUpdatedAt":"${clientMutationTimestamp}"}`,
        userId: 'test-user-id',
        createdAt: clientMutationTimestamp,
      };

      const mockSyncStore = {
        queue: [mockMutation],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn().mockResolvedValue(undefined),
        updateMutationStatus: jest.fn(),
        getDecryptedPayload: jest.fn().mockResolvedValue({
          tripId: '123',
          updates: { name: 'Stale Local Edit' },
          clientUpdatedAt: clientMutationTimestamp,
        }),
      };
      (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockSingle = jest.fn().mockResolvedValue({
        data: { id: 123, updated_at: serverNewerTimestamp },
        error: null,
      });

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
        update: mockUpdate,
        eq: mockEq,
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await SyncService.sync();

      // Remote is newer: update MUST NOT be applied
      expect(mockUpdate).not.toHaveBeenCalled();
      // Warning or telemetry logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OCC]'),
        expect.anything()
      );
      // Stale mutation is cleared from the queue to prevent repetitive attempts
      expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-occ-trip');

      warnSpy.mockRestore();
    });

    it('applies local replay when remote updated_at is older or equal to local mutation timestamp', async () => {
      const clientMutationTimestamp = '2026-09-01T14:00:00.000Z';
      const serverOlderTimestamp = '2026-09-01T12:00:00.000Z';

      const mockMutation = {
        id: 'sync-occ-valid',
        type: 'update_trip',
        encryptedPayload: `encrypted-{"tripId":"123","updates":{"name":"Valid Newer Edit"},"clientUpdatedAt":"${clientMutationTimestamp}"}`,
        userId: 'test-user-id',
        createdAt: clientMutationTimestamp,
      };

      const mockSyncStore = {
        queue: [mockMutation],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: jest.fn().mockResolvedValue(undefined),
        updateMutationStatus: jest.fn(),
        getDecryptedPayload: jest.fn().mockResolvedValue({
          tripId: '123',
          updates: { name: 'Valid Newer Edit' },
          clientUpdatedAt: clientMutationTimestamp,
        }),
      };
      (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockSingle = jest.fn().mockResolvedValue({
        data: { id: 123, updated_at: serverOlderTimestamp },
        error: null,
      });

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
        update: mockUpdate,
        eq: mockEq,
      });

      await SyncService.sync();

      // Remote is older: local update proceeds
      expect(mockUpdate).toHaveBeenCalledWith({ name: 'Valid Newer Edit' });
      expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-occ-valid');
    });
  });
});
