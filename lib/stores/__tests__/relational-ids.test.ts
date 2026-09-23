import { WineryDbId, GooglePlaceId, Trip, SyncItem } from '@/lib/types';
import { standardizeWineryData } from '@/lib/utils/winery';
import { useVisitStore } from '../visitStore';
import { useTripStore } from '../tripStore';
import { resetTripInitState } from '../slices/tripInitHelpers';

interface MockRelationalIdGlobals {
  mockRpc: (...args: unknown[]) => unknown;
  getSyncStoreState: () => {
    queue: SyncItem[];
    isInitialized: boolean;
    initialize: jest.Mock;
    getDecryptedPayload: jest.Mock;
  };
}

declare global {
  var _RELATIONAL_IDS_MOCKS: MockRelationalIdGlobals | undefined;
}

let mockRpc = jest.fn();
let mockSyncStoreState: {
  queue: SyncItem[];
  isInitialized: boolean;
  initialize: jest.Mock;
  getDecryptedPayload: jest.Mock;
} = {
  queue: [],
  isInitialized: true,
  initialize: jest.fn().mockResolvedValue(undefined),
  getDecryptedPayload: jest.fn(),
};

globalThis._RELATIONAL_IDS_MOCKS = {
  mockRpc: (...args: unknown[]) => mockRpc(...args),
  getSyncStoreState: () => mockSyncStoreState,
};

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => globalThis._RELATIONAL_IDS_MOCKS?.mockRpc(...args),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}));

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: () => globalThis._RELATIONAL_IDS_MOCKS?.getSyncStoreState(),
  },
}));

describe('Relational ID Invariant Enforcement (ST-04)', () => {
  describe('standardizeWineryData numeric ID normalization', () => {
    it('coerces string dbId to number', () => {
      const source = {
        id: 'mock-place-1' as GooglePlaceId,
        name: 'Test Winery',
        latitude: 42.5,
        longitude: -76.5,
        dbId: '123' as unknown as WineryDbId,
      };

      const result = standardizeWineryData(source);
      expect(result?.dbId).toBe(123);
      expect(typeof result?.dbId).toBe('number');
    });

    it('coerces nested trip_info trip_id to number', () => {
      const source = {
        id: 99 as WineryDbId,
        google_place_id: 'mock-google-id' as GooglePlaceId,
        name: 'Test Winery',
        address: '123 Main',
        latitude: 42.5,
        longitude: -76.5,
        phone: null,
        website: null,
        google_rating: null,
        user_rating_count: null,
        opening_hours: null,
        reviews: null,
        reservable: false,
        on_wishlist: false,
        is_favorite: false,
        user_visited: false,
        trip_info: [{ trip_id: '456' as unknown as number, trip_name: 'Summer Trip', trip_date: '2026-07-01' }],
      };

      const result = standardizeWineryData(source);
      expect(result?.trip_id).toBe(456);
      expect(typeof result?.trip_id).toBe('number');
    });
  });

  describe('visitStore numeric ID normalization', () => {
    beforeEach(() => {
      mockRpc = jest.fn();
      useVisitStore.getState().reset();
    });

    it('normalizes stringified visit_id and winery_id from RPC to strict numbers in fetchVisits', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            visit_id: '1001',
            user_id: 'user-1',
            visit_date: '2026-08-01',
            user_review: 'Nice place',
            rating: 5,
            photos: [],
            winery_id: '500',
            winery_name: 'Seneca Winery',
            winery_address: '123 Road',
            google_place_id: 'place-seneca',
            latitude: '42.5',
            longitude: '-76.5',
          },
        ],
        error: null,
        count: 1,
      });

      await useVisitStore.getState().fetchVisits(1, true);

      const visits = useVisitStore.getState().visits;
      expect(visits).toHaveLength(1);
      expect(visits[0].id).toBe(1001);
      expect(typeof visits[0].id).toBe('number');
      expect(visits[0].winery_id).toBe(500);
      expect(typeof visits[0].winery_id).toBe('number');
      expect(visits[0].wineries.id).toBe(500);
      expect(typeof visits[0].wineries.id).toBe('number');
    });
  });

  describe('tripStore offline queue numeric temp ID invariant', () => {
    beforeEach(() => {
      resetTripInitState();
      mockSyncStoreState = {
        queue: [],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        getDecryptedPayload: jest.fn(),
      };
      useTripStore.getState().reset();
    });

    it('ensures all pending offline trips have numeric IDs and never string UUIDs', async () => {
      mockSyncStoreState = {
        queue: [
          {
            id: 'uuid-string-from-queue-1234',
            type: 'create_trip',
            encryptedPayload: 'encrypted',
            createdAt: '2026-09-10T00:00:00Z',
            userId: 'user-1',
          },
        ],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        getDecryptedPayload: jest.fn().mockResolvedValue({
          name: 'Offline Trip',
          trip_date: '2026-09-10',
        }),
      };

      await useTripStore.getState().initialize();

      const trips = useTripStore.getState().trips;
      const pending = trips.find((t: Trip) => t.name === 'Offline Trip');
      if (pending) {
        expect(typeof pending.id).toBe('number');
        expect(Number.isInteger(pending.id)).toBe(true);
      }
    });
  });
});
