import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { useSyncStore } from '@/lib/stores/syncStore';
import { SyncService } from '@/lib/services/syncService';
import { TripService } from '@/lib/services/tripService';
import { Trip, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';

const mockAddMutation = jest.fn().mockResolvedValue(undefined);
const mockRemoveMutation = jest.fn().mockResolvedValue(undefined);
const mockUpdateMutationStatus = jest.fn();
const mockGetDecryptedPayload = jest.fn();

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: mockAddMutation,
      removeMutation: mockRemoveMutation,
      updateMutationStatus: mockUpdateMutationStatus,
      getDecryptedPayload: mockGetDecryptedPayload,
      queue: [],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    createTrip: jest.fn(),
    deleteTrip: jest.fn(),
    updateTrip: jest.fn(),
    getTrips: jest.fn().mockResolvedValue({ trips: [], count: 0 }),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
  })),
}));

describe('tripStore SyncStore integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);
    mockRemoveMutation.mockResolvedValue(undefined);
    (SyncService as any).isSyncing = false;

    // Mock navigator.onLine to false (default for enqueue tests)
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useTripStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should enqueue create_trip mutation in SyncStore when offline', async () => {
    const trip = { name: 'Test Trip', trip_date: '2023-01-01' };

    await act(async () => {
      await useTripStore.getState().createTrip(trip);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'create_trip',
      userId: 'user-123',
      payload: expect.objectContaining({
        name: 'Test Trip',
        trip_date: '2023-01-01',
      })
    }));
  });

  it('should enqueue delete_trip mutation in SyncStore when offline', async () => {
    const tripId = '456';

    await act(async () => {
      await useTripStore.getState().deleteTrip(tripId);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'delete_trip',
      userId: 'user-123',
      payload: expect.objectContaining({
        tripId: '456',
      })
    }));
  });

  it('should enqueue update_trip mutation in SyncStore when offline', async () => {
    const tripId = '456';
    const updates = { name: 'Updated Name' };

    await act(async () => {
      await useTripStore.getState().updateTrip(tripId, updates);
    });

    const addMutation = useSyncStore.getState().addMutation;
    expect(addMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'update_trip',
      userId: 'user-123',
      payload: expect.objectContaining({
        tripId: '456',
        updates: expect.objectContaining({ name: 'Updated Name' }),
      })
    }));
  });

  describe('offline create_trip replay with multi-stop parity', () => {
    const mockWinery1 = createMockWinery({
      id: 'place_1' as GooglePlaceId,
      dbId: 101 as WineryDbId,
      name: 'Dr. Konstantin Frank',
      latitude: 42.553,
      longitude: -77.159,
    });

    const mockWinery2 = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
      latitude: 42.793,
      longitude: -76.963,
    });

    it('replays offline multi-stop create_trip through TripService.createTrip without dropping stops 2+ and populates wineries_count', async () => {
      const tempId = -1001;
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'user-123',
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'pending',
        wineries_count: 2,
      };

      // Seed optimistic trip in tripStore
      useTripStore.setState({
        trips: [tempTrip],
        upcomingTrips: [tempTrip],
        tripsForDate: [tempTrip],
      });

      const payload = {
        tempId,
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
        notes: 'Two stops planned',
      };

      const mutationItem = {
        id: 'mutation-create-trip-123',
        type: 'create_trip',
        encryptedPayload: 'encrypted-payload',
        createdAt: new Date().toISOString(),
        userId: 'user-123',
      };

      (useSyncStore.getState as jest.Mock).mockReturnValue({
        queue: [mutationItem],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: mockRemoveMutation,
        updateMutationStatus: mockUpdateMutationStatus,
        getDecryptedPayload: mockGetDecryptedPayload.mockResolvedValue(payload),
        addMutation: mockAddMutation,
      });

      const serverSyncedTrip: Trip = {
        id: 501,
        user_id: 'user-123',
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'synced',
        wineries_count: 2,
      };
      (TripService.createTrip as jest.Mock).mockResolvedValue(serverSyncedTrip);

      // Transition to online
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      await act(async () => {
        await SyncService.sync();
      });

      // 1. Assert delegation to TripService.createTrip with full payload and idempotency key
      expect(TripService.createTrip).toHaveBeenCalledTimes(1);
      expect(TripService.createTrip).toHaveBeenCalledWith(payload, 'mutation-create-trip-123');

      // 2. Assert optimistic tempId was replaced with synced trip
      const storeTrips = useTripStore.getState().trips;
      const replaced = storeTrips.find(t => t.id === 501);
      expect(replaced).toBeDefined();
      expect(replaced?.wineries_count).toBe(2);
      expect(replaced?.wineries).toHaveLength(2);
      expect(replaced?.syncStatus).toBe('synced');

      // 3. Assert temp trip was removed
      expect(storeTrips.find(t => t.id === tempId)).toBeUndefined();

      // 4. Assert mutation was removed from sync store queue
      expect(mockRemoveMutation).toHaveBeenCalledWith('mutation-create-trip-123');
    });

    it('populates wineries_count from wineries array length when TripService.createTrip returns record without wineries_count', async () => {
      const tempId = -1002;
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'user-123',
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'pending',
        wineries_count: 2,
      };

      useTripStore.setState({ trips: [tempTrip] });

      const payload = {
        tempId,
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
      };

      const mutationItem = {
        id: 'mutation-create-trip-456',
        type: 'create_trip',
        encryptedPayload: 'encrypted-payload',
        createdAt: new Date().toISOString(),
        userId: 'user-123',
      };

      (useSyncStore.getState as jest.Mock).mockReturnValue({
        queue: [mutationItem],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: mockRemoveMutation,
        updateMutationStatus: mockUpdateMutationStatus,
        getDecryptedPayload: mockGetDecryptedPayload.mockResolvedValue(payload),
        addMutation: mockAddMutation,
      });

      // Trip returned without wineries_count property
      const serverTripWithoutCount: Partial<Trip> = {
        id: 502,
        user_id: 'user-123',
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'synced',
      };
      (TripService.createTrip as jest.Mock).mockResolvedValue(serverTripWithoutCount);

      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      await act(async () => {
        await SyncService.sync();
      });

      const replaced = useTripStore.getState().trips.find(t => t.id === 502);
      expect(replaced).toBeDefined();
      expect(replaced?.wineries_count).toBe(2);
    });

    it('triggers background cache invalidation for upcoming trips, all trips, and target date', async () => {
      const tempId = -1003;
      const targetDate = '2026-10-22';
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'user-123',
        name: 'Cayuga Route',
        trip_date: targetDate,
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'pending',
      };

      useTripStore.setState({ trips: [tempTrip] });

      const payload = {
        tempId,
        name: 'Cayuga Route',
        trip_date: targetDate,
        wineries: [mockWinery1, mockWinery2],
      };

      const mutationItem = {
        id: 'mutation-create-trip-789',
        type: 'create_trip',
        encryptedPayload: 'encrypted-payload',
        userId: 'user-123',
      };

      (useSyncStore.getState as jest.Mock).mockReturnValue({
        queue: [mutationItem],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: mockRemoveMutation,
        updateMutationStatus: mockUpdateMutationStatus,
        getDecryptedPayload: mockGetDecryptedPayload.mockResolvedValue(payload),
        addMutation: mockAddMutation,
      });

      (TripService.createTrip as jest.Mock).mockResolvedValue({
        id: 503,
        user_id: 'user-123',
        name: 'Cayuga Route',
        trip_date: targetDate,
        wineries: [mockWinery1, mockWinery2],
        wineries_count: 2,
        members: [],
        syncStatus: 'synced',
      });

      const fetchTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchTrips').mockResolvedValue(undefined);
      const fetchUpcomingTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchUpcomingTrips').mockResolvedValue(undefined);
      const fetchTripsForDateSpy = jest.spyOn(useTripStore.getState(), 'fetchTripsForDate').mockResolvedValue(undefined);

      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      await act(async () => {
        await SyncService.sync();
      });

      expect(fetchUpcomingTripsSpy).toHaveBeenCalled();
      expect(fetchTripsSpy).toHaveBeenCalledWith(1, 'upcoming', true);
      expect(fetchTripsForDateSpy).toHaveBeenCalledWith(targetDate);
    });
  });
});
