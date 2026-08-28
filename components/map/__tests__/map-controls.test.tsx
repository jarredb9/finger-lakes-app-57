import { render, screen, fireEvent } from '@testing-library/react';
import { MapControls } from '../map-controls';
import { useTripStore } from '@/lib/stores/tripStore';
import { useWineryMapContext } from '@/components/winery-map-context';
import { Trip } from '@/lib/types';

jest.mock('@/components/winery-map-context', () => ({
  useWineryMapContext: jest.fn(),
}));

describe('MapControls Container Component', () => {
  const defaultProps = {
    searchLocation: 'Geneva, NY',
    setSearchLocation: jest.fn(),
    isSearching: false,
    handleSearchSubmit: jest.fn((e) => e.preventDefault()),
    handleManualSearchArea: jest.fn(),
    autoSearch: false,
    setAutoSearch: jest.fn(),
    hitApiLimit: false,
    filter: ['all'],
    handleFilterChange: jest.fn(),
  };

  const mockContextValue = {
    searchLocation: 'Ithaca, NY',
    setSearchLocation: jest.fn(),
    isSearching: false,
    handleSearchSubmit: jest.fn((e) => e.preventDefault()),
    handleManualSearchArea: jest.fn(),
    autoSearch: true,
    setAutoSearch: jest.fn(),
    hitApiLimit: false,
    filter: ['visited'],
    handleFilterChange: jest.fn(),
    handlePlaceSelect: undefined,
    listResultsInView: [],
    handleOpenModal: jest.fn(),
    filteredWineries: [],
    selectedWinery: null,
    setSelectedWinery: jest.fn(),
    mapInstance: null,
    setMapInstance: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useWineryMapContext as jest.Mock).mockReturnValue(mockContextValue);
    useTripStore.setState({
      upcomingTrips: [],
      selectedTrip: null,
      trips: [],
    });
  });

  describe('Controlled Props Mode', () => {
    it('renders search input, search button, and manual search area button with standard touch targets', () => {
      render(<MapControls {...defaultProps} />);

      const searchInput = screen.getByLabelText(/search location/i);
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveClass('min-h-[44px]');

      const submitBtn = screen.getByLabelText(/submit search/i);
      expect(submitBtn).toBeInTheDocument();
      expect(submitBtn).toHaveClass('min-h-[44px]');
      expect(submitBtn).toHaveClass('min-w-[44px]');

      const manualSearchBtn = screen.getByRole('button', { name: /search this area/i });
      expect(manualSearchBtn).toBeInTheDocument();
      expect(manualSearchBtn).toHaveClass('min-h-[44px]');
    });

    it('renders filter chips and attribute toggle chips with minimum 44px touch targets', () => {
      render(<MapControls {...defaultProps} />);

      const allFilterChip = screen.getByRole('button', { name: /^all$/i });
      expect(allFilterChip).toBeInTheDocument();
      expect(allFilterChip).toHaveClass('min-h-[44px]');

      const dogFriendlyChip = screen.getByRole('button', { name: /dog friendly/i });
      expect(dogFriendlyChip).toBeInTheDocument();
      expect(dogFriendlyChip).toHaveClass('min-h-[44px]');

      const outdoorSeatingChip = screen.getByRole('button', { name: /outdoor seating/i });
      expect(outdoorSeatingChip).toBeInTheDocument();
      expect(outdoorSeatingChip).toHaveClass('min-h-[44px]');
    });

    it('triggers filter change when attribute chips are toggled', () => {
      const handleFilterChange = jest.fn();
      render(<MapControls {...defaultProps} handleFilterChange={handleFilterChange} />);

      const dogFriendlyChip = screen.getByRole('button', { name: /dog friendly/i });
      fireEvent.click(dogFriendlyChip);

      expect(handleFilterChange).toHaveBeenCalled();
    });
  });

  describe('Container & Context Decoupled Mode', () => {
    it('automatically reads state and handlers from WineryMapContext when rendered without props', () => {
      render(<MapControls />);

      const searchInput = screen.getByLabelText(/search location/i);
      expect(searchInput).toHaveValue('Ithaca, NY');

      const manualSearchBtn = screen.getByRole('button', { name: /search this area/i });
      fireEvent.click(manualSearchBtn);
      expect(mockContextValue.handleManualSearchArea).toHaveBeenCalled();

      const autoSwitch = screen.getByRole('switch', { name: /auto/i });
      expect(autoSwitch).toBeInTheDocument();
    });

    it('manages trip selection via useTripStore', async () => {
      const mockTrip: Trip = {
        id: 99,
        user_id: 'user-1',
        name: 'Seneca Tour',
        trip_date: '2026-10-01',
        wineries: [],
      };

      const fetchTripByIdMock = jest.fn().mockResolvedValue(mockTrip);
      useTripStore.setState({
        upcomingTrips: [mockTrip],
        trips: [mockTrip],
        selectedTrip: null,
        fetchTripById: fetchTripByIdMock,
      });

      render(<MapControls />);

      expect(screen.getByText(/trip overlay/i)).toBeInTheDocument();
      const combobox = screen.getByRole('combobox');
      expect(combobox).toBeInTheDocument();
    });
  });
});
