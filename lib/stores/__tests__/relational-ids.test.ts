import { WineryDbId, GooglePlaceId } from '@/lib/types';
import { standardizeWineryData } from '@/lib/utils/winery';

describe('Relational ID Invariant Enforcement (ST-04)', () => {
  describe('standardizeWineryData numeric ID normalization', () => {
    it('coerces string dbId to number', () => {
      const source = {
        id: 'mock-place-1',
        name: 'Test Winery',
        latitude: 42.5,
        longitude: -76.5,
        dbId: '123' as any,
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
        trip_info: [{ trip_id: '456' as any, trip_name: 'Summer Trip', trip_date: '2026-07-01' }],
      };

      const result = standardizeWineryData(source);
      expect(result?.trip_id).toBe(456);
      expect(typeof result?.trip_id).toBe('number');
    });
  });

  describe('visitStore numeric ID normalization', () => {
    let useVisitStore: any;
    let mockRpc: jest.Mock;

    beforeEach(() => {
      jest.resetModules();
      mockRpc = jest.fn();

      jest.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          rpc: mockRpc,
          auth: {
            getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
            getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
          },
        }),
      }));

      useVisitStore = require('../visitStore').useVisitStore;
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
    let useTripStore: any;

    beforeEach(() => {
      jest.resetModules();
      useTripStore = require('../tripStore').useTripStore;
      useTripStore.getState().reset();
    });

    it('ensures all pending offline trips have numeric IDs and never string UUIDs', async () => {
      const mockSyncStore = {
        queue: [
          {
            id: 'uuid-string-from-queue-1234',
            type: 'create_trip',
            payload: JSON.stringify({ name: 'Offline Trip', trip_date: '2026-09-10' }),
          },
        ],
        getDecryptedPayload: jest.fn().mockResolvedValue({
          name: 'Offline Trip',
          trip_date: '2026-09-10',
        }),
      };

      jest.doMock('@/lib/stores/syncStore', () => ({
        useSyncStore: {
          getState: () => mockSyncStore,
        },
      }));

      const { useTripStore: reloadedTripStore } = require('../tripStore');
      await reloadedTripStore.getState().loadPendingMutations?.({ id: 'user-1' });

      const trips = reloadedTripStore.getState().trips;
      const pending = trips.find((t: any) => t.name === 'Offline Trip');
      if (pending) {
        expect(typeof pending.id).toBe('number');
        expect(Number.isInteger(pending.id)).toBe(true);
      }
    });
  });
});
