import { act } from '@testing-library/react';
import { createMockTrip } from '@/lib/test-utils/fixtures';
import { useTripStore } from '../tripStore';

let mockTripService = {
  getTrips: jest.fn(),
  getTripById: jest.fn(),
  getUpcomingTrips: jest.fn(),
  getTripsForDate: jest.fn(),
  createTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateTrip: jest.fn(),
};

let mockAddMutation = jest.fn().mockResolvedValue(undefined);
let mockRpc = jest.fn();
let mockGetSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });

(globalThis as any)._TRIP_MOCKS = {
  mockTripService,
  mockAddMutation,
  mockRpc,
  mockGetSession,
};

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    getTrips: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getTrips(...args),
    getTripById: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getTripById(...args),
    getUpcomingTrips: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getUpcomingTrips(...args),
    getTripsForDate: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.getTripsForDate(...args),
    createTrip: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.createTrip(...args),
    deleteTrip: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.deleteTrip(...args),
    updateTrip: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockTripService.updateTrip(...args),
  },
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => ({
      ensureWineryDetails: jest.fn().mockResolvedValue({}),
      updateWinery: jest.fn(),
    })),
  },
}));

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockAddMutation(...args),
      queue: [],
      initialize: jest.fn(),
    })),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockRpc(...args),
    from: jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: (...args: any[]) => (globalThis as any)._TRIP_MOCKS.mockGetSession(...args),
    },
  })),
}));

describe('tripStore', () => {
  const mockTrip = createMockTrip();
  const mockTrips = [mockTrip];
  const mockCount = 1;

  beforeEach(() => {
    mockTripService = {
      getTrips: jest.fn(),
      getTripById: jest.fn(),
      getUpcomingTrips: jest.fn(),
      getTripsForDate: jest.fn(),
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    mockAddMutation = jest.fn().mockResolvedValue(undefined);
    mockRpc = jest.fn();
    mockGetSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });

    (globalThis as any)._TRIP_MOCKS = {
      mockTripService,
      mockAddMutation,
      mockRpc,
      mockGetSession,
    };

    useTripStore.getState().reset();
  });

  describe('fetchTrips', () => {
    it('should fetch trips successfully and update state', async () => {
      mockTripService.getTrips.mockResolvedValue({ trips: mockTrips, count: mockCount });

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.trips).toEqual(mockTrips);
      expect(state.count).toBe(mockCount);
      expect(state.isLoading).toBe(false);
      expect(mockTripService.getTrips).toHaveBeenCalled();
    });

    it('should handle fetch trips error', async () => {
      const error = new Error('Fetch failed');
      mockTripService.getTrips.mockRejectedValue(error);

      await act(async () => {
        await useTripStore.getState().fetchTrips(1, 'upcoming');
      });

      const state = useTripStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.trips).toEqual([]);
    });
  });

  describe('createTrip', () => {
    it('should create a trip successfully and add it to state', async () => {
      const newTripData = { name: 'New Trip', trip_date: '2026-10-15', wineries: [] };
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      let createdTrip;
      await act(async () => {
        createdTrip = await useTripStore.getState().createTrip(newTripData);
      });

      const state = useTripStore.getState();
      expect(state.trips).toContainEqual(mockTrip);
      expect(createdTrip).toEqual(mockTrip);
      expect(mockTripService.createTrip).toHaveBeenCalledWith(newTripData, expect.any(String));
    });

    it('strips unpermitted fields (id, user_id, created_at, notes, arbitrary keys) and prevents state and service pollution', async () => {
      let resolveService: (value: any) => void;
      const servicePromise = new Promise((resolve) => {
        resolveService = resolve;
      });
      mockTripService.createTrip.mockReturnValue(servicePromise);

      useTripStore.setState({
        tripsForDate: [{ ...mockTrip, trip_date: '2026-10-15' }],
      });

      const adversarialInput = {
        name: 'Sanitized New Trip',
        trip_date: '2026-10-15',
        id: 99999,
        user_id: 'attacker-user-id',
        created_at: '2020-01-01T00:00:00Z',
        notes: 'stray winery note',
        malicious: true,
        extraKey: 'unexpected_data',
      };

      let createPromise: Promise<any>;
      await act(async () => {
        createPromise = useTripStore.getState().createTrip(adversarialInput as any);
      });

      const state = useTripStore.getState();
      const createdOptimisticTrip = state.trips.find(t => t.name === 'Sanitized New Trip') as any;
      const createdUpcoming = state.upcomingTrips.find(t => t.name === 'Sanitized New Trip') as any;
      const createdDate = state.tripsForDate.find(t => t.name === 'Sanitized New Trip') as any;

      // Invariant: Core immutable fields MUST NOT be overwritten by injected keys
      expect(createdOptimisticTrip).toBeDefined();
      expect(createdOptimisticTrip.id).toBeLessThan(0); // temporary negative ID, not 99999
      expect(createdOptimisticTrip.user_id).toBe('test-user'); // from session, not attacker-user-id
      expect(createdOptimisticTrip.name).toBe('Sanitized New Trip');

      // Invariant: Unpermitted keys MUST NOT leak into store collections
      expect(createdOptimisticTrip.notes).toBeUndefined();
      expect(createdOptimisticTrip.malicious).toBeUndefined();
      expect(createdOptimisticTrip.extraKey).toBeUndefined();

      expect(createdUpcoming).toBeDefined();
      expect(createdUpcoming.id).toBeLessThan(0);
      expect(createdUpcoming.user_id).toBe('test-user');
      expect(createdUpcoming.notes).toBeUndefined();
      expect(createdUpcoming.malicious).toBeUndefined();

      expect(createdDate).toBeDefined();
      expect(createdDate.id).toBeLessThan(0);
      expect(createdDate.user_id).toBe('test-user');
      expect(createdDate.notes).toBeUndefined();
      expect(createdDate.malicious).toBeUndefined();

      // Invariant: Service payload passed to TripService must ONLY contain permitted fields
      expect(mockTripService.createTrip).toHaveBeenCalledWith(
        {
          name: 'Sanitized New Trip',
          trip_date: '2026-10-15',
          wineries: [],
        },
        expect.any(String)
      );

      // Complete the promise and verify final synced state
      await act(async () => {
        resolveService!({
          ...mockTrip,
          id: 500,
          name: 'Sanitized New Trip',
        });
        await createPromise!;
      });

      const finalState = useTripStore.getState();
      expect(finalState.trips[0].id).toBe(500);
      expect(finalState.trips[0].name).toBe('Sanitized New Trip');
      expect((finalState.trips[0] as any).notes).toBeUndefined();
      expect((finalState.trips[0] as any).malicious).toBeUndefined();
    });

    it('logs development console.warn warning when unpermitted keys are supplied', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      try {
        await act(async () => {
          await useTripStore.getState().createTrip({
            name: 'Valid Trip',
            unpermittedKey: 'injected',
            id: 9999,
          } as any);
        });

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[createTrip] Warning: Unpermitted or invalid keys stripped from create payload:'),
          expect.arrayContaining(['unpermittedKey', 'id'])
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('validates field types and handles invalid non-string name, invalid date format, and non-array wineries', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      try {
        await act(async () => {
          await useTripStore.getState().createTrip({
            name: 12345,
            trip_date: 'invalid-date-string',
            wineries: 'not-an-array',
          } as any);
        });

        expect(warnSpy).toHaveBeenCalled();
        expect(mockTripService.createTrip).toHaveBeenCalledWith(
          {
            trip_date: expect.any(String),
            wineries: [],
          },
          expect.any(String)
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('handles nullish and non-record create payloads defensively returning null without throwing', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      try {
        let result1, result2;
        await act(async () => {
          result1 = await useTripStore.getState().createTrip(null as any);
          result2 = await useTripStore.getState().createTrip('not an object' as any);
        });

        expect(result1).toBeNull();
        expect(result2).toBeNull();
        expect(mockTripService.createTrip).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[createTrip] Warning: Invalid or non-object trip payload received:'),
          null
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('updateTrip', () => {
    it('should update a trip successfully and update state with valid fields', async () => {
      useTripStore.setState({
        trips: [mockTrip],
        upcomingTrips: [mockTrip],
        tripsForDate: [mockTrip],
      });
      const updatedTrip = { ...mockTrip, name: 'Updated Title', trip_date: '2026-10-15' };
      mockTripService.updateTrip.mockResolvedValue(updatedTrip);

      await act(async () => {
        await useTripStore.getState().updateTrip(String(mockTrip.id), {
          name: 'Updated Title',
          trip_date: '2026-10-15',
        } as any);
      });

      const state = useTripStore.getState();
      expect(state.trips[0].name).toBe('Updated Title');
      expect(state.trips[0].trip_date).toBe('2026-10-15');
      expect(state.upcomingTrips[0].name).toBe('Updated Title');
      expect(state.tripsForDate[0].name).toBe('Updated Title');
      expect(mockTripService.updateTrip).toHaveBeenCalledWith(String(mockTrip.id), {
        name: 'Updated Title',
        trip_date: '2026-10-15',
      });
    });

    it('strips unpermitted fields (id, user_id, notes, arbitrary keys) and prevents state and service pollution', async () => {
      useTripStore.setState({
        trips: [mockTrip],
        upcomingTrips: [mockTrip],
        tripsForDate: [mockTrip],
      });
      mockTripService.updateTrip.mockResolvedValue(undefined);

      const adversarialUpdates = {
        name: 'Sanitized Trip Name',
        id: 99999,
        user_id: 'attacker-user-id',
        created_at: '2020-01-01T00:00:00Z',
        notes: 'stray winery note',
        malicious: true,
        extraKey: 'unexpected_data',
      };

      await act(async () => {
        await useTripStore.getState().updateTrip(String(mockTrip.id), adversarialUpdates as any);
      });

      const state = useTripStore.getState();
      const updatedTrip = state.trips[0] as any;
      const updatedUpcoming = state.upcomingTrips[0] as any;
      const updatedDate = state.tripsForDate[0] as any;

      // Invariant: Core immutable fields MUST NOT be overwritten by unwhitelisted mutation keys
      expect(updatedTrip.id).toBe(100);
      expect(updatedTrip.user_id).toBe('user-123');
      expect(updatedTrip.name).toBe('Sanitized Trip Name');

      // Invariant: Unpermitted keys MUST NOT leak into store collections
      expect(updatedTrip.notes).toBeUndefined();
      expect(updatedTrip.malicious).toBeUndefined();
      expect(updatedTrip.extraKey).toBeUndefined();

      expect(updatedUpcoming.id).toBe(100);
      expect(updatedUpcoming.user_id).toBe('user-123');
      expect(updatedUpcoming.notes).toBeUndefined();
      expect(updatedUpcoming.malicious).toBeUndefined();

      expect(updatedDate.id).toBe(100);
      expect(updatedDate.user_id).toBe('user-123');
      expect(updatedDate.notes).toBeUndefined();
      expect(updatedDate.malicious).toBeUndefined();

      // Invariant: Service payload passed to TripService and sync queue must ONLY contain whitelisted fields
      expect(mockTripService.updateTrip).toHaveBeenCalledWith(String(mockTrip.id), {
        name: 'Sanitized Trip Name',
      });
    });

    it('logs development console.warn warning when unpermitted keys are supplied', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      useTripStore.setState({ trips: [mockTrip] });
      mockTripService.updateTrip.mockResolvedValue(undefined);

      try {
        await act(async () => {
          await useTripStore.getState().updateTrip(String(mockTrip.id), {
            name: 'Valid Name',
            unpermittedKey: 'injected',
          } as any);
        });

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[updateTrip] Warning: Unpermitted or invalid keys stripped from update payload:'),
          expect.arrayContaining(['unpermittedKey'])
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('rejects invalid non-string name and invalid date format, leaving existing fields intact', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      useTripStore.setState({ trips: [mockTrip] });
      mockTripService.updateTrip.mockResolvedValue(undefined);

      try {
        await act(async () => {
          await useTripStore.getState().updateTrip(String(mockTrip.id), {
            name: 12345,
            trip_date: 'invalid-date-string',
          } as any);
        });

        const state = useTripStore.getState();
        // Invariant: Existing valid name and trip_date are preserved when invalid types are passed
        expect(state.trips[0].name).toBe('Test Trip');
        expect(state.trips[0].trip_date).toBe(mockTrip.trip_date);

        // Dev warning must be logged for invalid values
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('handles nullish and non-record update payloads defensively without throwing uncaught exceptions', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      useTripStore.setState({ trips: [mockTrip] });
      mockTripService.updateTrip.mockResolvedValue(undefined);

      try {
        await act(async () => {
          await useTripStore.getState().updateTrip(String(mockTrip.id), null as any);
        });

        const state = useTripStore.getState();
        expect(state.trips[0].name).toBe('Test Trip');
        expect(mockTripService.updateTrip).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('deleteTrip', () => {
    it('should delete a trip successfully and remove it from state', async () => {
      useTripStore.setState({ trips: [mockTrip], tripsForDate: [mockTrip] });
      mockTripService.deleteTrip.mockResolvedValue(true);

      await act(async () => {
        await useTripStore.getState().deleteTrip(String(mockTrip.id));
      });

      const state = useTripStore.getState();
      expect(state.trips).toHaveLength(0);
      expect(state.tripsForDate).toHaveLength(0);
    });
  });

  describe('addWineryToTrips network failure (ST-07)', () => {
    it('does not enqueue empty {} or log_visit mutation on multi-trip network failure', async () => {
      mockAddMutation = jest.fn().mockResolvedValue(undefined);
      mockRpc = jest.fn().mockRejectedValue(new Error('Failed to fetch'));
      mockGetSession = jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-test-123' } } },
        error: null,
      });

      (globalThis as any)._TRIP_MOCKS = {
        mockTripService,
        mockAddMutation,
        mockRpc,
        mockGetSession,
      };

      const mockWinery = { id: 'winery-1', dbId: 10, name: 'Seneca Estate' };

      await act(async () => {
        await useTripStore.getState().addWineryToTrips(mockWinery as any, new Date('2026-09-02T12:00:00Z'), new Set(['456']), 'New Trip', 'Note');
      });

      // Valid update_trip mutation SHOULD be enqueued
      expect(mockAddMutation).toHaveBeenCalledWith(expect.objectContaining({
        type: 'update_trip',
        userId: 'user-test-123',
      }));

      // Corrupting empty {} and log_visit mutations MUST NOT be enqueued
      expect(mockAddMutation).not.toHaveBeenCalledWith(expect.objectContaining({
        type: 'log_visit',
      }));
      expect(mockAddMutation).not.toHaveBeenCalledWith(expect.objectContaining({
        payload: {},
      }));
    });
  });
});
