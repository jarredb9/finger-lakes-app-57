import { render, screen, fireEvent } from '@testing-library/react';
import TripCard from '../TripCardPresentational';
import { createMockTrip, createMockUser, createMockTripMember } from '../../test/factories/dataFactory';

// This test should NOT mock zustand stores.
// It will likely fail until TripCard is refactored to take these as props and STOP using stores.

jest.mock('@/components/ui/command', () => ({
  Command: ({ children }: any) => <div>{children}</div>,
  CommandInput: ({ value, onValueChange, placeholder }: any) => (
    <input 
      placeholder={placeholder} 
      value={value} 
      onChange={(e) => onValueChange(e.target.value)} 
    />
  ),
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: any) => (
    <div onClick={onSelect}>{children}</div>
  ),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: any) => (
    <div data-testid="popover-root" data-open={open}>{children}</div>
  ),
  PopoverTrigger: ({ children }: any) => children,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

describe('TripCard Presentational', () => {
  const trip = createMockTrip();
  const user = createMockUser();
  const currentMembers = [createMockTripMember()];

  const defaultProps: any = {
    trip,
    isOwner: true,
    canEdit: true,
    user,
    currentMembers,
    onUpdateTrip: jest.fn(),
    onDeleteTrip: jest.fn(),
    onUpdateWineryOrder: jest.fn(),
    onToggleWineryOnTrip: jest.fn(),
    onRemoveWineryFromTrip: jest.fn(),
    onSaveWineryNote: jest.fn(),
    onOpenShareDialog: jest.fn(),
    onOpenWineryNoteEditor: jest.fn(),
    onExportToMaps: jest.fn(),
    searchResults: [],
    isSearching: false,
    winerySearch: '',
    onSearchChange: jest.fn(),
  };

  it('renders correctly without store mocks', () => {
    render(<TripCard {...defaultProps} />);
    expect(screen.getByText(trip.name!)).toBeInTheDocument();
  });

  it('triggers onOpenShareDialog when share button is clicked', () => {
    render(<TripCard {...defaultProps} />);
    const shareButton = screen.getByLabelText(/Share Trip/i);
    fireEvent.click(shareButton);
    expect(defaultProps.onOpenShareDialog).toHaveBeenCalledWith(trip.id.toString(), trip.name);
  });

  it('triggers onSearchChange when typing in search input', () => {
    render(<TripCard {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/Edit Trip/i));
    
    const addWineryBtn = screen.getByText(/Add a Winery/i);
    fireEvent.click(addWineryBtn);

    const searchInput = screen.getByPlaceholderText(/Search wineries.../i);
    fireEvent.change(searchInput, { target: { value: 'New York' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('New York');
  });
});
