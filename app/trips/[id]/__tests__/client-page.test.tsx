import { render, screen } from '@testing-library/react';
import TripDetailClientPage from '../client-page';
import { useTripStore } from '@/lib/stores/tripStore';

// Mock the trip store
jest.mock('@/lib/stores/tripStore');

// Mock the TripCard component to simplify testing
jest.mock('@/components/trip-card', () => {
  return function MockTripCard({ trip }: { trip: any }) {
    return <div data-testid="trip-card">{trip.name}</div>;
  };
});

// Mock TripNavigation to assert integration on trip detail page
jest.mock('@/components/TripNavigation', () => {
  return {
    TripNavigation: function MockTripNavigation({ stops }: { stops: any[] }) {
      return (
        <div data-testid="trip-navigation" data-stops-count={stops?.length || 0}>
          Trip Navigation Control
        </div>
      );
    },
  };
});

describe('TripDetailClientPage', () => {
  const mockFetchTripById = jest.fn();
  const mockSetSelectedTrip = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementation
    (useTripStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        fetchTripById: mockFetchTripById,
        setSelectedTrip: mockSetSelectedTrip,
        isLoading: false,
        trips: [],
      };
      return selector(state);
    });
  });

  it('should trigger fetchTripById on mount', () => {
    render(<TripDetailClientPage tripId="123" />);
    expect(mockFetchTripById).toHaveBeenCalledWith('123');
  });

  it('should display loading skeleton when loading or trip not found', () => {
    (useTripStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        fetchTripById: mockFetchTripById,
        setSelectedTrip: mockSetSelectedTrip,
        isLoading: true,
        trips: [],
      };
      return selector(state);
    });

    const { container } = render(<TripDetailClientPage tripId="123" />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('should render TripCard when trip data is available', () => {
    const mockTrip = { id: 123, name: 'My Awesome Trip' };

    (useTripStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        fetchTripById: mockFetchTripById,
        setSelectedTrip: mockSetSelectedTrip,
        isLoading: false,
        trips: [mockTrip],
      };
      return selector(state);
    });

    render(<TripDetailClientPage tripId="123" />);
    expect(screen.getByTestId('trip-card')).toHaveTextContent('My Awesome Trip');
  });

  it('should integrate TripNavigation for trips with stops and not trigger in-app geolocation', () => {
    const geolocationSpy = jest.fn();
    const originalGeolocation = global.navigator.geolocation;
    Object.defineProperty(global.navigator, 'geolocation', {
      value: { getCurrentPosition: geolocationSpy },
      configurable: true,
    });

    const mockTrip = {
      id: 123,
      name: 'Napa Valley Tour',
      wineries: [
        { id: 'w1', name: 'Winery 1', latitude: 38.3, longitude: -122.3 },
        { id: 'w2', name: 'Winery 2', latitude: 38.4, longitude: -122.4 },
      ],
    };

    (useTripStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        fetchTripById: mockFetchTripById,
        setSelectedTrip: mockSetSelectedTrip,
        isLoading: false,
        trips: [mockTrip],
      };
      return selector(state);
    });

    render(<TripDetailClientPage tripId="123" />);

    expect(screen.getByTestId('trip-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('trip-navigation')).toHaveAttribute('data-stops-count', '2');
    expect(geolocationSpy).not.toHaveBeenCalled();

    Object.defineProperty(global.navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    });
  });
});
