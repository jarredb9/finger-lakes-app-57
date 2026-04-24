const mockRpc = jest.fn().mockResolvedValue({ 
  data: { friends: [], pending_incoming: [], pending_outgoing: [] }, 
  error: null 
});

// @ts-ignore
globalThis._MOCK_RPC = mockRpc;

const mockClient = {
  rpc: mockRpc,
  storage: {
    from: jest.fn().mockReturnThis(),
    createSignedUrls: jest.fn().mockResolvedValue({ data: [], error: null }),
  },
  channel: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
};

// @ts-ignore
globalThis._MOCK_CLIENT = mockClient;

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => (globalThis as any)._MOCK_CLIENT),
}));

describe('friendStore', () => {
  let useFriendStore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    useFriendStore = require('../friendStore').useFriendStore;
    useFriendStore.getState().reset();
    
    process.env.NEXT_PUBLIC_IS_E2E = 'true';
    localStorage.clear();
    // @ts-ignore
    delete globalThis._E2E_ENABLE_REAL_SYNC;
  });

  it('should skip real sync if shouldSkipRealSync() is true (E2E mode)', async () => {
    await useFriendStore.getState().fetchFriends();
    
    expect(mockRpc).not.toHaveBeenCalled();
    expect(useFriendStore.getState().isLoading).toBe(false);
  });

  it('should NOT skip real sync if _E2E_ENABLE_REAL_SYNC is true in localStorage', async () => {
    localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
    
    await useFriendStore.getState().fetchFriends();
    
    expect(mockRpc).toHaveBeenCalled();
  });

  it('should NOT skip real sync if _E2E_ENABLE_REAL_SYNC is true in globalThis', async () => {
    // @ts-ignore
    globalThis._E2E_ENABLE_REAL_SYNC = true;
    
    await useFriendStore.getState().fetchFriends();
    
    expect(mockRpc).toHaveBeenCalled();
  });
});
