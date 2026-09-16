import { act } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { createMockVisitWithWinery, createMockWinery } from '@/lib/test-utils/fixtures';
import { Base64Photo } from '@/lib/utils/sync-helpers';
import { GooglePlaceId, SyncItem, WineryDbId } from '@/lib/types';
import { resetVisitInitState } from '../slices/visitInitHelpers';
import { useVisitStore } from '../visitStore';
import { useSyncStore } from '../syncStore';
import { decrypt } from '@/lib/utils/crypto';

// Ensure Web Crypto API is available in JSDOM test environment
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

interface MockSupabaseClient {
  auth: {
    getUser: jest.Mock;
    getSession: jest.Mock;
  };
  rpc: jest.Mock;
  storage: {
    from: jest.Mock;
  };
}

interface MockWineryStoreState {
  addVisitToWinery: jest.Mock;
  replaceVisit: jest.Mock;
  optimisticallyDeleteVisit: jest.Mock;
  confirmOptimisticUpdate: jest.Mock;
  optimisticallyUpdateVisit: jest.Mock;
  revertOptimisticUpdate: jest.Mock;
  getWineries: jest.Mock;
  upsertWinery: jest.Mock;
}

interface MockDomainInvariantGlobals {
  getSupabase: () => MockSupabaseClient;
  getWineryStore: () => MockWineryStoreState;
}

declare global {
  var _VISIT_DOMAIN_INVARIANT_MOCKS: MockDomainInvariantGlobals | undefined;
}

let mockSupabase: MockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: { id: 'user-visit-invariant-123' } },
      error: null,
    }),
    getSession: jest.fn().mockResolvedValue({
      data: { session: { user: { id: 'user-visit-invariant-123' } } },
      error: null,
    }),
  },
  rpc: jest.fn().mockResolvedValue({ data: { visit_id: 999, winery_id: 101 }, error: null }),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ error: null }),
      remove: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
};

let mockWineryStoreState: MockWineryStoreState = {
  addVisitToWinery: jest.fn(),
  replaceVisit: jest.fn(),
  optimisticallyDeleteVisit: jest.fn(),
  confirmOptimisticUpdate: jest.fn(),
  optimisticallyUpdateVisit: jest.fn(),
  revertOptimisticUpdate: jest.fn(),
  getWineries: jest.fn().mockReturnValue([]),
  upsertWinery: jest.fn(),
};

globalThis._VISIT_DOMAIN_INVARIANT_MOCKS = {
  getSupabase: () => mockSupabase,
  getWineryStore: () => mockWineryStoreState,
};

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => globalThis._VISIT_DOMAIN_INVARIANT_MOCKS?.getSupabase()),
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => globalThis._VISIT_DOMAIN_INVARIANT_MOCKS?.getWineryStore()),
  },
}));

describe('visitStore Domain Invariants & Offline Reconstitution', () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    resetVisitInitState();

    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-visit-invariant-123' } },
          error: null,
        }),
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-visit-invariant-123' } } },
          error: null,
        }),
      },
      rpc: jest.fn().mockResolvedValue({ data: { visit_id: 999, winery_id: 101 }, error: null }),
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn().mockResolvedValue({ error: null }),
          remove: jest.fn().mockResolvedValue({ error: null }),
        })),
      },
    };

    mockWineryStoreState = {
      addVisitToWinery: jest.fn(),
      replaceVisit: jest.fn(),
      optimisticallyDeleteVisit: jest.fn(),
      confirmOptimisticUpdate: jest.fn(),
      optimisticallyUpdateVisit: jest.fn(),
      revertOptimisticUpdate: jest.fn(),
      getWineries: jest.fn().mockReturnValue([]),
      upsertWinery: jest.fn(),
    };

    useVisitStore.getState().reset();
    useSyncStore.setState({
      queue: [],
      isInitialized: true,
      getDecryptedPayload: async <T = unknown>(item: SyncItem, userId: string): Promise<T> => {
        return (await decrypt(item.encryptedPayload, userId)) as T;
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true, configurable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Invariant 1: React 19 StrictMode Concurrent Initialization Mutex & ID Normalization', () => {
    it('deduplicates concurrent initialize() calls and reconstitutes offline queued mutations with normalized IDs', async () => {
      const mockQueue: SyncItem[] = [
        {
          id: 'mutation-visit-1',
          type: 'log_visit',
          encryptedPayload: 'encrypted-visit-payload-1',
          createdAt: new Date().toISOString(),
          userId: 'user-visit-invariant-123',
          status: 'pending',
        },
      ];

      const getDecryptedPayloadSpy = jest.fn().mockImplementation((item: SyncItem) => {
        if (item.type === 'log_visit') {
          return Promise.resolve({
            tempId: '-999',
            wineryId: 'winery-seneca-1' as GooglePlaceId,
            wineryDbId: 101,
            wineryName: 'Seneca Shore Wine Cellars',
            wineryAddress: '9292 State Route 14',
            latitude: 42.6,
            longitude: -76.9,
            visit_date: '2026-10-15',
            user_review: 'Exceptional Riesling tasting',
            rating: 5,
            photos: [],
            is_private: false,
          });
        }
        return Promise.resolve({});
      });

      useSyncStore.setState({
        queue: mockQueue,
        isInitialized: true,
        getDecryptedPayload: getDecryptedPayloadSpy,
      });

      // Existing server visit in state
      const existingVisit = createMockVisitWithWinery({ id: 101 });
      useVisitStore.setState({ visits: [existingVisit] });

      // Simulate React 19 StrictMode concurrent double-mount
      await act(async () => {
        await Promise.all([
          useVisitStore.getState().initialize(),
          useVisitStore.getState().initialize(),
        ]);
      });

      // Assert Mutex: getDecryptedPayload called once per queued item (1 total, not 2)
      expect(getDecryptedPayloadSpy).toHaveBeenCalledTimes(1);

      const state = useVisitStore.getState();
      expect(state.visits).toHaveLength(2);

      const reconstituted = state.visits.find(v => String(v.id) === '-999');
      expect(reconstituted).toBeDefined();
      expect(reconstituted!.syncStatus).toBe('pending');
      expect(reconstituted!.wineryName).toBe('Seneca Shore Wine Cellars');

      // Assert relational foreign key normalization
      expect(reconstituted!.winery_id).toBe(101);
      expect(typeof reconstituted!.wineries.id).toBe('number');
      expect(reconstituted!.wineries.id).toBe(101);
    });

    it('deduplicates visits across existing store state and queued mutations even with mixed numeric/string IDs', async () => {
      const mockQueue: SyncItem[] = [
        {
          id: 'mutation-visit-dup',
          type: 'log_visit',
          encryptedPayload: 'encrypted-payload-dup',
          createdAt: new Date().toISOString(),
          userId: 'user-visit-invariant-123',
          status: 'pending',
        },
      ];

      const getDecryptedPayloadSpy = jest.fn().mockResolvedValue({
        tempId: '-100', // String representation in payload
        wineryId: 'winery-dup' as GooglePlaceId,
        wineryDbId: 50,
        wineryName: 'Dr. Frank',
        visit_date: '2026-10-15',
        user_review: 'Duplicate check review',
        rating: 5,
        photos: [],
      });

      useSyncStore.setState({
        queue: mockQueue,
        isInitialized: true,
        getDecryptedPayload: getDecryptedPayloadSpy,
      });

      // Pre-existing visit has numeric ID -100
      const existingVisit = createMockVisitWithWinery({ id: -100 as any });
      useVisitStore.setState({ visits: [existingVisit] });

      await act(async () => {
        await useVisitStore.getState().initialize();
      });

      const state = useVisitStore.getState();
      // Must NOT duplicate the visit (must remain 1)
      expect(state.visits).toHaveLength(1);
    });
  });

  describe('Invariant 2: Binary Base64 Photo Serialization & Preview URLs ("The Reconstitution Rule")', () => {
    it('injectVisitWithPhotos generates blob preview URLs for File inputs and data URLs for Base64Photo inputs', async () => {
      const winery = createMockWinery({ id: 'w-inject-1' as GooglePlaceId, dbId: 101 as WineryDbId, name: 'Lakewood Vineyards' });
      const binaryFile = new File(['fake-jpg-binary-stream'], 'glass.jpg', { type: 'image/jpeg' });
      const existingBase64Photo: Base64Photo = {
        __isBase64: true,
        base64: 'aGVsbG93b3JsZA==',
        name: 'barrel.jpg',
        type: 'image/jpeg',
      };

      const visitData = {
        visit_date: '2026-10-15',
        user_review: 'Spectacular vineyard view',
        rating: 5,
        photos: [binaryFile, existingBase64Photo],
        is_private: true,
      };

      await act(async () => {
        await useVisitStore.getState().injectVisitWithPhotos!(winery, visitData);
      });

      const state = useVisitStore.getState();
      expect(state.visits).toHaveLength(1);
      const optimisticVisit = state.visits[0];

      // Optimistic visit UI assertions
      expect(optimisticVisit.syncStatus).toBe('pending');
      expect(optimisticVisit.winery_id).toBe(101);
      expect(optimisticVisit.wineries.id).toBe(101);
      expect(optimisticVisit.photos).toHaveLength(2);
      expect(optimisticVisit.photos![0]).toMatch(/^blob:/);
      expect(optimisticVisit.photos![1]).toBe('data:image/jpeg;base64,aGVsbG93b3JsZA==');
      expect(optimisticVisit.is_private).toBe(true);

      // Winery store update assertion
      expect(mockWineryStoreState.addVisitToWinery).toHaveBeenCalledWith(winery.id, expect.objectContaining({
        photos: expect.arrayContaining([
          expect.stringMatching(/^blob:/),
          'data:image/jpeg;base64,aGVsbG93b3JsZA==',
        ]),
      }));

      // Sync queue payload assertion: File must be stabilized to Base64Photo object
      const syncQueue = useSyncStore.getState().queue;
      expect(syncQueue).toHaveLength(1);
      const queuedMutation = syncQueue[0];
      expect(queuedMutation.type).toBe('log_visit');

      const decryptedPayload = await useSyncStore.getState().getDecryptedPayload<{ photos: Base64Photo[]; is_private?: boolean }>(
        queuedMutation,
        'user-visit-invariant-123'
      );
      expect(decryptedPayload.photos).toHaveLength(2);
      expect(decryptedPayload.photos[0].__isBase64).toBe(true);
      expect(decryptedPayload.photos[0].type).toBe('image/jpeg');
      expect(decryptedPayload.photos[0].name).toBe('glass.jpg');
      expect(decryptedPayload.photos[1].__isBase64).toBe(true);
      expect(decryptedPayload.photos[1].base64).toBe('aGVsbG93b3JsZA==');
      expect(decryptedPayload.is_private).toBe(true);
    });

    it('initializeVisitStoreHelper reconstitutes Base64Photo items in queue back to data URLs for in-memory display', async () => {
      const mockQueue: SyncItem[] = [
        {
          id: 'mutation-photo-recon',
          type: 'log_visit',
          encryptedPayload: 'enc-photo-payload',
          createdAt: new Date().toISOString(),
          userId: 'user-visit-invariant-123',
          status: 'pending',
        },
      ];

      const getDecryptedPayloadSpy = jest.fn().mockResolvedValue({
        tempId: 'temp-photo-recon-1',
        wineryId: 'w-photo' as GooglePlaceId,
        wineryDbId: 202,
        wineryName: 'Boundary Breaks',
        visit_date: '2026-10-15',
        user_review: 'Sunset tasting',
        rating: 5,
        photos: [
          {
            __isBase64: true,
            base64: 'c3Vuc2V0LXBob3Rv',
            name: 'sunset.png',
            type: 'image/png',
          },
        ],
      });

      useSyncStore.setState({
        queue: mockQueue,
        isInitialized: true,
        getDecryptedPayload: getDecryptedPayloadSpy,
      });

      await act(async () => {
        await useVisitStore.getState().initialize();
      });

      const state = useVisitStore.getState();
      expect(state.visits).toHaveLength(1);
      expect(state.visits[0].photos).toEqual(['data:image/png;base64,c3Vuc2V0LXBob3Rv']);
    });
  });

  describe('Invariant 3: Offline Queue Encryption & Payload Decryption Error Recovery', () => {
    it('encrypts offline mutation payloads and successfully reconstitutes through SyncStore', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

      const winery = createMockWinery({ id: 'w-offline-enc' as GooglePlaceId, dbId: 303 as WineryDbId, name: 'Ravines' });
      const visitData = {
        visit_date: '2026-10-15',
        user_review: 'Offline encryption check',
        rating: 4,
        photos: [],
      };

      await act(async () => {
        await useVisitStore.getState().saveVisit(winery, visitData);
      });

      const queue = useSyncStore.getState().queue;
      expect(queue).toHaveLength(1);
      // Payload MUST be encrypted string, not plain object or JSON
      expect(typeof queue[0].encryptedPayload).toBe('string');
      expect(queue[0].encryptedPayload).not.toContain('Offline encryption check');

      // Reset visit store and verify clean reconstitution via initialize()
      useVisitStore.getState().reset();
      await act(async () => {
        await useVisitStore.getState().initialize();
      });

      const reconstituted = useVisitStore.getState().visits;
      expect(reconstituted).toHaveLength(1);
      expect(reconstituted[0].user_review).toBe('Offline encryption check');
      expect(reconstituted[0].syncStatus).toBe('pending');
    });

    it('recovers gracefully and continues queue processing when a single item has corrupted ciphertext', async () => {
      const mockQueue: SyncItem[] = [
        {
          id: 'corrupted-item-1',
          type: 'log_visit',
          encryptedPayload: 'corrupted-bad-ciphertext',
          createdAt: new Date().toISOString(),
          userId: 'user-visit-invariant-123',
          status: 'pending',
        },
        {
          id: 'valid-item-2',
          type: 'log_visit',
          encryptedPayload: 'valid-ciphertext',
          createdAt: new Date().toISOString(),
          userId: 'user-visit-invariant-123',
          status: 'pending',
        },
      ];

      const getDecryptedPayloadSpy = jest.fn().mockImplementation((item: SyncItem) => {
        if (item.id === 'corrupted-item-1') {
          return Promise.reject(new Error('Decryption error: invalid MAC header'));
        }
        return Promise.resolve({
          tempId: 'temp-valid-2',
          wineryId: 'w-valid' as GooglePlaceId,
          wineryDbId: 404,
          wineryName: 'Valid Winery',
          visit_date: '2026-10-15',
          user_review: 'Valid visit after corrupted item',
          rating: 5,
          photos: [],
        });
      });

      useSyncStore.setState({
        queue: mockQueue,
        isInitialized: true,
        getDecryptedPayload: getDecryptedPayloadSpy,
      });

      // Spying console.error to keep test output clean
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await act(async () => {
        await useVisitStore.getState().initialize();
      });

      const state = useVisitStore.getState();
      // Valid item must be reconstituted despite first item failing decryption
      expect(state.visits).toHaveLength(1);
      expect(state.visits[0].id).toBe('temp-valid-2');
      expect(state.visits[0].wineryName).toBe('Valid Winery');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Invariant 4: True Optimistic Deletion Rollback on Server Rejection', () => {
    it('reverts optimistic deletion and restores visit with syncStatus: "error" when server RPC rejects with 403 Forbidden', async () => {
      const visit = createMockVisitWithWinery({ id: 505 as any, winery_id: 101 as WineryDbId, user_review: 'Original Review' });
      useVisitStore.setState({ visits: [visit] });

      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: '403: Forbidden - Cannot delete visit of another user', code: '42501' },
      });

      await act(async () => {
        await expect(useVisitStore.getState().deleteVisit('505')).rejects.toEqual(
          expect.objectContaining({ message: expect.stringContaining('403: Forbidden') })
        );
      });

      // Winery store optimistic deletion must be reverted
      expect(mockWineryStoreState.revertOptimisticUpdate).toHaveBeenCalledTimes(1);

      // Visit in visit store must be restored with syncStatus: 'error'
      const state = useVisitStore.getState();
      expect(state.visits).toHaveLength(1);
      expect(state.visits[0].id).toBe(505);
      expect(state.visits[0].syncStatus).toBe('error');
    });

    it('enqueues delete_visit mutation in SyncStore without throwing when user is offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

      const visit = createMockVisitWithWinery({ id: 606 as any, winery_id: 101 as WineryDbId });
      useVisitStore.setState({ visits: [visit] });

      await act(async () => {
        await useVisitStore.getState().deleteVisit('606');
      });

      // Visit is removed from store state optimistically
      const state = useVisitStore.getState();
      expect(state.visits).toHaveLength(0);

      // Mutation is queued in sync store
      const queue = useSyncStore.getState().queue;
      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe('delete_visit');

      const decryptedPayload = await useSyncStore.getState().getDecryptedPayload<{ visitId: string }>(
        queue[0],
        'user-visit-invariant-123'
      );
      expect(decryptedPayload.visitId).toBe('606');
    });
  });
});
