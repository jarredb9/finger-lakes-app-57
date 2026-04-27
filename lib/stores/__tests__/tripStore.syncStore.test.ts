import { act } from '@testing-library/react';

describe('tripStore SyncStore integration', () => {
  let useTripStore: any;
  let useSyncStore: any;

  beforeEach(() => {
    jest.resetModules();

    // Mock SyncStore
    const mockAddMutation = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@/lib/stores/syncStore', () => ({
      useSyncStore: {
        getState: jest.fn(() => ({
          addMutation: mockAddMutation,
          queue: [],
          initialize: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/lib/services/tripService', () => ({
      TripService: {
        createTrip: jest.fn(),
        deleteTrip: jest.fn(),
        updateTrip: jest.fn(),
        getTrips: jest.fn().mockResolvedValue({ trips: [], count: 0 }),
      },
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        auth: {
          getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
        },
        rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
      })),
    }));

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useTripStore = require('../tripStore').useTripStore;
    useSyncStore = require('@/lib/stores/syncStore').useSyncStore;
    
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
        trip_date: '2023-01-01'
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
        tripId: '456'
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
        updates: expect.objectContaining({ name: 'Updated Name' })
      })
    }));
  });
});
