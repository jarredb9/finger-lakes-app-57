import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { useSyncStore } from '@/lib/stores/syncStore';

const mockAddMutation = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: mockAddMutation,
      queue: [],
      initialize: jest.fn(),
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
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
  })),
}));

describe('tripStore SyncStore integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);

    // Mock navigator.onLine to false
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
});
