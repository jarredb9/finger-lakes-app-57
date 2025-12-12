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
        isLoading: true, // Simulating loading
        trips: [],
      };
      return selector(state);
    });

    const { container } = render(<TripDetailClientPage tripId="123" />);
    // Check for skeleton class or structure
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
});
