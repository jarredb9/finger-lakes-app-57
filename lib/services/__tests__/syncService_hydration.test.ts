import { SyncService } from '../syncService';
import { useSyncStore } from '@/lib/stores/syncStore';
import { createClient } from '@/utils/supabase/client';

// Mock dependencies
jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn()
  }
}));
jest.mock('@/utils/supabase/client');

describe('SyncService Auth Hydration', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (SyncService as any).isSyncing = false;

    mockSupabase = {
      auth: {
        getUser: jest.fn(),
        getSession: jest.fn(),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (useSyncStore.getState as jest.Mock).mockReturnValue({
      queue: [{ id: '1', type: 'log_visit', status: 'pending' }],
      isInitialized: true,
      removeMutation: jest.fn(),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue({}),
    });
  });

  it('should wait for auth hydration if getUser initially returns null', async () => {
    jest.useFakeTimers();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    let authCallback: any;
    mockSupabase.auth.onAuthStateChange.mockImplementation((cb: any) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const syncPromise = SyncService.sync();
    
    await Promise.resolve();
    await Promise.resolve();
    
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled();
    
    // Now trigger auth change
    authCallback('SIGNED_IN', { user: { id: 'test-user-id' } });
    
    await syncPromise;
    
    expect(mockSupabase.rpc).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('should timeout if auth hydration takes too long', async () => {
    jest.useFakeTimers();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const syncPromise = SyncService.sync();
    
    await Promise.resolve();
    await Promise.resolve();
    
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled();
    
    // Fast-forward past the 3s timeout
    jest.advanceTimersByTime(3500);
    
    await jest.runAllTimersAsync();
    await syncPromise;
    
    // Should NOT have called RPC because auth failed/timed out
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
