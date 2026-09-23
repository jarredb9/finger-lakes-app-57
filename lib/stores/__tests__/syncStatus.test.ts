import { act } from '@testing-library/react';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { useTripStore } from '../tripStore';
import { useVisitStore } from '../visitStore';

const mockTripService = {
  getTrips: jest.fn(),
  getTripById: jest.fn(),
  getUpcomingTrips: jest.fn(),
  getTripsForDate: jest.fn(),
  createTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateTrip: jest.fn(),
};

const mockRpc = jest.fn();

const mockWineryStoreState = {
  addVisitToWinery: jest.fn(),
  replaceVisit: jest.fn(),
  optimisticallyDeleteVisit: jest.fn(),
  confirmOptimisticUpdate: jest.fn(),
  getWineries: jest.fn(() => []),
};

const mockWineryStore = {
  getState: jest.fn(() => mockWineryStoreState),
};

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    getTrips: (...args: any[]) => mockTripService.getTrips(...args),
    getTripById: (...args: any[]) => mockTripService.getTripById(...args),
    getUpcomingTrips: (...args: any[]) => mockTripService.getUpcomingTrips(...args),
    getTripsForDate: (...args: any[]) => mockTripService.getTripsForDate(...args),
    createTrip: (...args: any[]) => mockTripService.createTrip(...args),
    deleteTrip: (...args: any[]) => mockTripService.deleteTrip(...args),
    updateTrip: (...args: any[]) => mockTripService.updateTrip(...args),
  },
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: Object.assign(
    (selector: any) => (typeof selector === 'function' ? selector(mockWineryStore.getState()) : mockWineryStore.getState()),
    {
      getState: () => mockWineryStore.getState(),
      setState: jest.fn(),
      subscribe: jest.fn(() => () => {}),
    }
  ),
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => mockRpc(...args),
    from: jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      single: jest.fn(),
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null }),
        remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
      })),
    },
  })),
}));

describe('useTripStore SyncStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.getState().reset();
  });

  it('should set syncStatus to pending during createTrip and synced after completion', async () => {
    const newTripParams = { name: 'New Trip', trip_date: '2023-01-01' };
    const createdTrip = createMockTrip({ ...newTripParams, id: 123, syncStatus: 'synced' });
    
    let resolveService: (value: any) => void;
    const servicePromise = new Promise((resolve) => {
      resolveService = resolve;
    });
    mockTripService.createTrip.mockReturnValue(servicePromise);

    let createPromise: Promise<any>;
    await act(async () => {
      createPromise = useTripStore.getState().createTrip(newTripParams);
    });

    // Check optimistic state
    const optimisticState = useTripStore.getState();
    const optimisticTrip = optimisticState.trips.find((t: any) => t.name === 'New Trip');
    expect(optimisticTrip).toBeDefined();
    expect(optimisticTrip?.syncStatus).toBe('pending');

    await act(async () => {
      resolveService!(createdTrip);
      await createPromise!;
    });

    // Check final state
    const finalState = useTripStore.getState();
    const finalTrip = finalState.trips.find((t: any) => t.id === 123);
    expect(finalTrip).toBeDefined();
    expect(finalTrip?.syncStatus).toBe('synced');
  });

  it('should roll back and remove optimistic trip if createTrip fails permanently', async () => {
    const newTripParams = { name: 'Failing Trip', trip_date: '2023-01-01' };
    
    let rejectService: (reason: any) => void;
    const servicePromise = new Promise((_, reject) => {
      rejectService = reject;
    });
    mockTripService.createTrip.mockReturnValue(servicePromise);

    let createPromise: Promise<any>;
    await act(async () => {
      createPromise = useTripStore.getState().createTrip(newTripParams);
    });

    await act(async () => {
      rejectService!(new Error('Permanent failure'));
      try {
        await createPromise!;
      } catch (e) {
        // expected
      }
    });

    const state = useTripStore.getState();
    const failedTrip = state.trips.find((t: any) => t.name === 'Failing Trip');
    expect(failedTrip).toBeUndefined();
  });

  it('should set syncStatus to error if updateTrip fails', async () => {
    const existingTrip = createMockTrip({ id: 200, name: 'Existing Trip', syncStatus: 'synced' });
    useTripStore.setState({ trips: [existingTrip] });

    mockTripService.updateTrip.mockRejectedValueOnce(new Error('Update failed'));

    await act(async () => {
      try {
        await useTripStore.getState().updateTrip('200', { name: 'Renamed Trip' });
      } catch {
        // expected
      }
    });

    const state = useTripStore.getState();
    const failedTrip = state.trips.find((t: any) => t.id === 200);
    expect(failedTrip).toBeDefined();
    expect(failedTrip?.syncStatus).toBe('error');
  });
});

describe('useVisitStore SyncStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useVisitStore.getState().reset();
  });

  it('should set syncStatus to pending during saveVisit and synced after completion', async () => {
    const winery = createMockWinery();
    const visitData = { visit_date: '2023-01-01', user_review: 'Great!', rating: 5, photos: [] };
    
    mockRpc.mockReturnValue(new Promise((resolve) => {
      setTimeout(() => resolve({ data: { visit_id: '123', winery_id: 1 }, error: null }), 50);
    }));

    let savePromise: Promise<any>;
    await act(async () => {
      savePromise = useVisitStore.getState().saveVisit(winery, visitData);
    });

    // Check optimistic state
    const optimisticState = useVisitStore.getState();
    const optimisticVisit = optimisticState.visits[0];
    expect(optimisticVisit).toBeDefined();
    expect(optimisticVisit?.syncStatus).toBe('pending');

    await act(async () => {
      await savePromise!;
    });

    // Check final state
    const finalState = useVisitStore.getState();
    const finalVisit = finalState.visits.find((v: any) => v.id === '123');
    expect(finalVisit).toBeDefined();
    expect(finalVisit?.syncStatus).toBe('synced');
  });
});
