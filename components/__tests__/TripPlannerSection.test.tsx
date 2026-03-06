import { render, screen, fireEvent, act } from '@testing-library/react';
import TripPlannerSection from '../TripPlannerSection';
import { useTripStore } from '@/lib/stores/tripStore';
import { createMockWinery, createMockTrip } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

// Mock the store
jest.mock('@/lib/stores/tripStore');
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock DatePicker to be a simple button for testing
jest.mock('../DatePicker', () => ({
  DatePicker: ({ onSelect }: any) => (
    <button onClick={() => onSelect(new Date('2023-01-01T12:00:00Z'))}>Mock Date Picker</button>
  ),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('TripPlannerSection', () => {
  const mockWinery = createMockWinery({ id: 'winery-1' as GooglePlaceId, dbId: 101 as WineryDbId });
  const mockTrip = createMockTrip({ id: 201, name: 'Test Trip', trip_date: '2023-01-01' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be reactive to tripsForDate changes', async () => {
    const state = {
      selectedTrip: null,
      tripsForDate: [],
      fetchTripsForDate: jest.fn(),
      addWineryToTrips: jest.fn(),
      toggleWineryOnTrip: jest.fn(),
    };

    const mockStore = jest.fn((selector) => selector(state));
    (useTripStore as any).mockImplementation(mockStore);

    render(<TripPlannerSection winery={mockWinery} onClose={jest.fn()} />);
    expect(mockStore).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should show trips and allow selection after date is picked', async () => {
    const fetchTripsForDate = jest.fn();
    const addWineryToTrips = jest.fn().mockResolvedValue(undefined);
    
    (useTripStore as any).mockImplementation((selector: any) => {
      const state = {
        selectedTrip: null,
        tripsForDate: [mockTrip],
        fetchTripsForDate,
        addWineryToTrips,
        toggleWineryOnTrip: jest.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<TripPlannerSection winery={mockWinery} onClose={jest.fn()} />);

    // Pick a date via mocked button
    fireEvent.click(screen.getByText('Mock Date Picker'));
    expect(fetchTripsForDate).toHaveBeenCalledWith('2023-01-01');

    // Verify trip from store is visible
    expect(screen.getByText('Test Trip')).toBeInTheDocument();

    // Select the trip
    const checkbox = screen.getByTestId('trip-checkbox');
    fireEvent.click(checkbox);

    // Click Add to Trip
    const addBtn = screen.getByTestId('add-to-trip-btn');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(addWineryToTrips).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Winery added to trip(s).' }));
  });

  it('should handle "Create a new trip" option', async () => {
    const addWineryToTrips = jest.fn().mockResolvedValue(undefined);
    (useTripStore as any).mockImplementation((selector: any) => {
      const state = {
        selectedTrip: null,
        tripsForDate: [],
        fetchTripsForDate: jest.fn(),
        addWineryToTrips,
        toggleWineryOnTrip: jest.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<TripPlannerSection winery={mockWinery} onClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Mock Date Picker'));
    
    // Select "Create a new trip"
    fireEvent.click(screen.getByTestId('new-trip-checkbox'));
    
    // Fill in new trip name
    const nameInput = screen.getByTestId('new-trip-name-input');
    fireEvent.change(nameInput, { target: { value: 'My Awesome Trip' } });

    // Add notes
    const notesInput = screen.getByTestId('trip-notes-input');
    fireEvent.change(notesInput, { target: { value: 'Great Riesling here' } });

    const addBtn = screen.getByTestId('add-to-trip-btn');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(addWineryToTrips).toHaveBeenCalledWith(
      mockWinery,
      expect.any(Date),
      new Set(['new']),
      'My Awesome Trip',
      'Great Riesling here'
    );
  });

  it('should allow deselecting trips and "new trip" option', async () => {
    (useTripStore as any).mockImplementation((selector: any) => {
      const state = {
        selectedTrip: null,
        tripsForDate: [mockTrip],
        fetchTripsForDate: jest.fn(),
        addWineryToTrips: jest.fn(),
        toggleWineryOnTrip: jest.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<TripPlannerSection winery={mockWinery} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Mock Date Picker'));

    const tripCheckbox = screen.getByTestId('trip-checkbox');
    const newTripCheckbox = screen.getByTestId('new-trip-checkbox');

    // Toggle on and then off
    fireEvent.click(tripCheckbox);
    fireEvent.click(tripCheckbox);
    
    fireEvent.click(newTripCheckbox);
    fireEvent.click(newTripCheckbox);

    expect(screen.queryByTestId('new-trip-name-input')).not.toBeInTheDocument();
  });

  it('should handle errors in handleAddToTrip', async () => {
    const addWineryToTrips = jest.fn().mockRejectedValue(new Error('API Failure'));
    (useTripStore as any).mockImplementation((selector: any) => {
      const state = {
        selectedTrip: null,
        tripsForDate: [],
        fetchTripsForDate: jest.fn(),
        addWineryToTrips,
        toggleWineryOnTrip: jest.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<TripPlannerSection winery={mockWinery} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Mock Date Picker'));
    fireEvent.click(screen.getByTestId('new-trip-checkbox'));
    fireEvent.change(screen.getByTestId('new-trip-name-input'), { target: { value: 'Err' } });

    const addBtn = screen.getByTestId('add-to-trip-btn');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: 'API Failure', variant: 'destructive' }));
  });

  it('should handle errors in handleToggleWineryOnActiveTrip', async () => {
    const toggleWineryOnTrip = jest.fn().mockRejectedValue('Generic Error String');
    (useTripStore as any).mockImplementation((selector: any) => {
      const state = {
        selectedTrip: mockTrip,
        tripsForDate: [],
        fetchTripsForDate: jest.fn(),
        addWineryToTrips: jest.fn(),
        toggleWineryOnTrip,
      };
      return selector ? selector(state) : state;
    });

    render(<TripPlannerSection winery={mockWinery} onClose={jest.fn()} />);
    
    const toggleBtn = screen.getByRole('button', { name: /add to this trip/i });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ 
      description: 'An error occurred while updating the trip.', 
      variant: 'destructive' 
    }));
  });
});
