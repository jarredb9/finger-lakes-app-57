import { render, screen, fireEvent } from '@testing-library/react';
import { MapControls } from '../map/map-controls';
import { useTripStore } from '@/lib/stores/tripStore';

describe('MapControls Component', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.setState({
      upcomingTrips: [],
      selectedTrip: null,
    });
  });

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
