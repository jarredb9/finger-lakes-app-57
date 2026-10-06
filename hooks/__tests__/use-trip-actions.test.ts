import { renderHook, act } from '@testing-library/react';
import { useTripActions } from '../use-trip-actions';
import { useFriendStore } from '@/lib/stores/friendStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { useToast } from '@/hooks/use-toast';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(),
}));

describe('useTripActions', () => {
  const mockToast = jest.fn();
  const mockFetchFriends = jest.fn();
  const mockAddMembersToTrip = jest.fn();
  let originalWindowOpen: typeof window.open;
  let originalGeolocation: Geolocation | undefined;

  const mockWinery1 = createMockWinery({
    id: 'place_1' as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: 'Dr. Konstantin Frank',
    address: '9749 Middle Rd, Hammondsport, NY',
  });

  const mockWinery2 = createMockWinery({
    id: 'place_2' as GooglePlaceId,
    dbId: 102 as WineryDbId,
    name: 'Ravines Wine Cellars',
    address: '400 Barracks Rd, Geneva, NY',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });

    useFriendStore.setState({
      fetchFriends: mockFetchFriends,
      friends: [],
    });

    useTripStore.setState({
      addMembersToTrip: mockAddMembersToTrip,
    });

    originalWindowOpen = window.open;
    window.open = jest.fn();
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    window.open = originalWindowOpen;
    if (originalGeolocation !== undefined) {
      Object.defineProperty(navigator, 'geolocation', {
        value: originalGeolocation,
        configurable: true,
        writable: true,
      });
    }
  });

  it('fetches friends on mount', () => {
    const trip = createMockTrip({ id: 1 });
    renderHook(() => useTripActions(trip));

    expect(mockFetchFriends).toHaveBeenCalledTimes(1);
  });

  describe('handleExportToMaps', () => {
    it('returns early and does not open a window if trip.wineries is undefined or empty', () => {
      const tripEmpty = createMockTrip({ id: 1, wineries: [] });
      const { result } = renderHook(() => useTripActions(tripEmpty));

      act(() => {
        result.current.handleExportToMaps();
      });

      expect(window.open).not.toHaveBeenCalled();
    });

    it('exports directions with user coordinates when geolocation is available and successful', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1, mockWinery2],
      });

      const mockGetCurrentPosition = jest.fn((success) => {
        success({
          coords: {
            latitude: 42.44,
            longitude: -76.5,
          },
        });
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        result.current.handleExportToMaps();
      });

      const expectedWinery1 = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedWinery2 = encodeURIComponent(`${mockWinery2.name}, ${mockWinery2.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/42.44,-76.5/${expectedWinery1}/${expectedWinery2}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    });

    it('exports directions with a single winery destination when geolocation succeeds', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1],
      });

      const mockGetCurrentPosition = jest.fn((success) => {
        success({
          coords: {
            latitude: 42.44,
            longitude: -76.5,
          },
        });
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        result.current.handleExportToMaps();
      });

      const expectedWinery1 = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/42.44,-76.5/${expectedWinery1}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    });

    it('falls back to winery waypoints without user location when geolocation errors', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1, mockWinery2],
      });

      const mockGetCurrentPosition = jest.fn((_success, error) => {
        error(new Error('Permission denied'));
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        result.current.handleExportToMaps();
      });

      const expectedWinery1 = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedWinery2 = encodeURIComponent(`${mockWinery2.name}, ${mockWinery2.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/${expectedWinery1}/${expectedWinery2}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    });

    it('falls back to winery waypoints when navigator.geolocation is unavailable', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1, mockWinery2],
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        result.current.handleExportToMaps();
      });

      const expectedWinery1 = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedWinery2 = encodeURIComponent(`${mockWinery2.name}, ${mockWinery2.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/${expectedWinery1}/${expectedWinery2}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    });
  });

  describe('saveTripMembers', () => {
    it('successfully updates members and triggers success toast', async () => {
      mockAddMembersToTrip.mockResolvedValueOnce(undefined);
      const trip = createMockTrip({ id: 10 });
      const { result } = renderHook(() => useTripActions(trip));

      await act(async () => {
        await result.current.saveTripMembers(['friend-1', 'friend-2']);
      });

      expect(mockAddMembersToTrip).toHaveBeenCalledWith('10', ['friend-1', 'friend-2']);
      expect(mockToast).toHaveBeenCalledWith({ description: 'Trip members updated.' });
    });

    it('triggers error toast when addMembersToTrip fails', async () => {
      mockAddMembersToTrip.mockRejectedValueOnce(new Error('DB failure'));
      const trip = createMockTrip({ id: 10 });
      const { result } = renderHook(() => useTripActions(trip));

      await act(async () => {
        await result.current.saveTripMembers(['friend-1']);
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        description: 'Failed to update members.',
      });
    });
  });
});
