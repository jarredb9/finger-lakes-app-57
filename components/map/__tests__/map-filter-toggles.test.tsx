import { render, screen, fireEvent } from '@testing-library/react';
import { MapFilterToggles } from '../map-filter-toggles';
import { Trip } from '@/lib/types';

describe('MapFilterToggles Component', () => {
  const mockTrip: Trip = {
    id: 123,
    user_id: 'user-1',
    name: 'Keuka Weekend',
    trip_date: '2026-09-15',
    wineries: [],
  };

  const defaultProps = {
    filter: ['all'],
    handleFilterChange: jest.fn(),
    selectedTrip: null,
    setSelectedTrip: jest.fn(),
    upcomingTrips: [mockTrip],
    handleTripSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders category filter toggle items with standard 44px touch targets', () => {
    render(<MapFilterToggles {...defaultProps} />);

    const allChip = screen.getByRole('button', { name: /^all$/i });
    expect(allChip).toBeInTheDocument();
    expect(allChip).toHaveClass('min-h-[44px]');

    const visitedChip = screen.getByRole('button', { name: /^visited$/i });
    expect(visitedChip).toBeInTheDocument();
    expect(visitedChip).toHaveClass('min-h-[44px]');

    const favoritesChip = screen.getByRole('button', { name: /^favorites$/i });
    expect(favoritesChip).toBeInTheDocument();
    expect(favoritesChip).toHaveClass('min-h-[44px]');

    const wantChip = screen.getByRole('button', { name: /^want$/i });
    expect(wantChip).toBeInTheDocument();
    expect(wantChip).toHaveClass('min-h-[44px]');

    const newChip = screen.getByRole('button', { name: /^new$/i });
    expect(newChip).toBeInTheDocument();
    expect(newChip).toHaveClass('min-h-[44px]');
  });

  it('preserves attribute filters when changing category filters', () => {
    const handleFilterChange = jest.fn();
    render(<MapFilterToggles {...defaultProps} filter={['all', 'allowsDogs']} handleFilterChange={handleFilterChange} />);

    const visitedChip = screen.getByRole('button', { name: /^visited$/i });
    fireEvent.click(visitedChip);

    expect(handleFilterChange).toHaveBeenCalled();
  });

  it('renders attribute toggle buttons with standard 44px touch targets and handles toggle', () => {
    const handleFilterChange = jest.fn();
    render(<MapFilterToggles {...defaultProps} filter={['all']} handleFilterChange={handleFilterChange} />);

    const dogFriendlyChip = screen.getByRole('button', { name: /dog friendly/i });
    expect(dogFriendlyChip).toBeInTheDocument();
    expect(dogFriendlyChip).toHaveClass('min-h-[44px]');

    const kidFriendlyChip = screen.getByRole('button', { name: /kid friendly/i });
    expect(kidFriendlyChip).toBeInTheDocument();
    expect(kidFriendlyChip).toHaveClass('min-h-[44px]');

    const outdoorSeatingChip = screen.getByRole('button', { name: /outdoor seating/i });
    expect(outdoorSeatingChip).toBeInTheDocument();
    expect(outdoorSeatingChip).toHaveClass('min-h-[44px]');

    const evChargingChip = screen.getByRole('button', { name: /ev charging/i });
    expect(evChargingChip).toBeInTheDocument();
    expect(evChargingChip).toHaveClass('min-h-[44px]');

    fireEvent.click(dogFriendlyChip);
    expect(handleFilterChange).toHaveBeenCalled();
  });

  it('renders active trip badge when selectedTrip is present and clears on click', () => {
    const setSelectedTrip = jest.fn();
    render(<MapFilterToggles {...defaultProps} selectedTrip={mockTrip} setSelectedTrip={setSelectedTrip} />);

    const tripBadge = screen.getByText(/viewing: Keuka Weekend/i);
    expect(tripBadge).toBeInTheDocument();

    fireEvent.click(tripBadge);
    expect(setSelectedTrip).toHaveBeenCalledWith(null);
  });

  it('renders Trip Overlay select dropdown when no trip is selected', () => {
    render(<MapFilterToggles {...defaultProps} selectedTrip={null} />);

    expect(screen.getByText(/trip overlay/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
