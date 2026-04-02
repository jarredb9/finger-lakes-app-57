import { render, screen, fireEvent, act } from '@testing-library/react';
import TripCard from '../TripCardPresentational';
import { createMockTrip, createMockUser, createMockTripMember } from '../../test/factories/dataFactory';

const mockUpdateTrip = jest.fn();
const mockDeleteTrip = jest.fn();
const mockUpdateWineryOrder = jest.fn();
const mockToggleWineryOnTrip = jest.fn();
const mockRemoveWineryFromTrip = jest.fn();
const mockSaveWineryNote = jest.fn();
const mockOpenShareDialog = jest.fn();
const mockOpenWineryNoteEditor = jest.fn();
const mockHandleExportToMaps = jest.fn();

// Note: We are still mocking UI components for simplicity in unit tests
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => children,
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: any) => (
    <div data-testid="popover-root" data-open={open}>{children}</div>
  ),
  PopoverTrigger: ({ children }: any) => children,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

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
  CommandItem: ({ children, onSelect, "data-testid": testId }: any) => (
    <div onClick={onSelect} data-testid={testId}>{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => {
  const Button = ({ children, onClick, disabled, className, variant, size, ...props }: any) => (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      className={className} 
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  );
  Button.displayName = 'Button';
  return { Button };
});

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
  AvatarImage: ({ src }: any) => <img src={src} alt="avatar" />,
  AvatarFallback: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => (
    <div data-testid="dnd-context" onClick={() => onDragEnd({ destination: { index: 1 }, source: { index: 0 } })}>
      {children}
    </div>
  ),
  Droppable: ({ children }: any) => <div>{children({
    draggableProps: {},
    innerRef: jest.fn(),
    droppableProps: {},
  }, {} as any)}</div>,
  Draggable: ({ children }: any) => <div>{children({
    draggableProps: {},
    innerRef: jest.fn(),
    dragHandleProps: {},
  }, {} as any)}</div>,
}));

jest.mock('../DatePicker', () => {
  const DatePicker = ({ onSelect }: any) => (
    <div data-testid="date-picker" onClick={() => onSelect(undefined)} />
  );
  DatePicker.displayName = 'DatePicker';
  return { DatePicker };
});

jest.mock('../DailyHours', () => {
  const DailyHours = () => null;
  DailyHours.displayName = 'DailyHours';
  return DailyHours;
});

describe('TripCard', () => {
  const mockTrip = createMockTrip({
    id: 1,
    name: 'Test Trip',
    wineries: [
      { 
        id: 'winery-1', 
        dbId: 101, 
        name: 'Winery One', 
        address: '123 Wine St',
        lat: 42.44,
        lng: -76.50,
        visits: [
          { user_id: 'user-1', rating: 5, user_review: 'Great!', profiles: { name: 'You' } },
          { user_id: 'friend-1', rating: 4, user_review: 'Nice!', profiles: { name: 'Friend One' } }
        ]
      } as any
    ],
  });

  const mockUser = createMockUser({ id: 'user-1' });
  const mockMembers = [
    createMockTripMember({ id: 'user-1', name: 'You', email: 'you@example.com' }),
    createMockTripMember({ id: 'friend-1', name: 'Friend One', email: 'friend@example.com' })
  ];

  const defaultProps = {
    trip: mockTrip,
    isOwner: true,
    canEdit: true,
    user: mockUser,
    currentMembers: mockMembers,
    onUpdateTrip: mockUpdateTrip,
    onDeleteTrip: mockDeleteTrip,
    onUpdateWineryOrder: mockUpdateWineryOrder,
    onToggleWineryOnTrip: mockToggleWineryOnTrip,
    onRemoveWineryFromTrip: mockRemoveWineryFromTrip,
    onSaveWineryNote: mockSaveWineryNote,
    onOpenShareDialog: mockOpenShareDialog,
    onOpenWineryNoteEditor: mockOpenWineryNoteEditor,
    onExportToMaps: mockHandleExportToMaps,
    searchResults: [],
    isSearching: false,
    winerySearch: '',
    onSearchChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTrip.mockResolvedValue({ success: true });
    mockDeleteTrip.mockResolvedValue({ success: true });
    mockRemoveWineryFromTrip.mockResolvedValue({ success: true });
    mockSaveWineryNote.mockResolvedValue({ success: true });
  });

  it('renders correctly including reviews and distance', () => {
    const tripWithTwo = {
      ...mockTrip,
      wineries: [
        ...mockTrip.wineries!,
        { id: 'winery-2', dbId: 102, name: 'Winery Two', lat: 42.45, lng: -76.51 }
      ]
    };
    render(<TripCard {...defaultProps} trip={tripWithTwo as any} />);
    expect(screen.getByText(/Test Trip/i)).toBeInTheDocument();
    expect(screen.getByText(/Winery One/i)).toBeInTheDocument();
    expect(screen.getByText(/Great!/i)).toBeInTheDocument();
    expect(screen.getByText(/to next stop/i)).toBeInTheDocument();
  });

  it('triggers onDeleteTrip when delete button is clicked', async () => {
    render(<TripCard {...defaultProps} />);
    const deleteButton = screen.getByLabelText(/Delete Trip/i);
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(mockDeleteTrip).toHaveBeenCalledWith('1');
  });

  it('handles onDeleteTrip error', async () => {
    mockDeleteTrip.mockRejectedValue(new Error('Delete failed'));
    render(<TripCard {...defaultProps} />);
    const deleteButton = screen.getByLabelText(/Delete Trip/i);
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(mockDeleteTrip).toHaveBeenCalled();
  });

  it('opens share dialog when share button is clicked', () => {
    render(<TripCard {...defaultProps} />);
    const shareButton = screen.getByLabelText(/Share Trip/i);
    fireEvent.click(shareButton);
    expect(mockOpenShareDialog).toHaveBeenCalledWith('1', expect.stringContaining('Test Trip'));
  });

  it('switches to editing mode and saves changes', async () => {
    render(<TripCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const input = screen.getByPlaceholderText(/Trip Name/i);
    fireEvent.change(input, { target: { value: 'Updated Name' } });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    });
    
    expect(mockUpdateTrip).toHaveBeenCalledWith('1', expect.objectContaining({ name: 'Updated Name' }));
  });

  it('handles onUpdateTrip error', async () => {
    mockUpdateTrip.mockRejectedValue(new Error('Update failed'));
    render(<TripCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    });
    
    expect(mockUpdateTrip).toHaveBeenCalled();
    // Toast is handled by parent, so we just verify call
  });

  it('handles empty date validation in handleSave', async () => {
    render(<TripCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    fireEvent.click(screen.getByTestId('date-picker'));
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    });
    
    expect(mockUpdateTrip).not.toHaveBeenCalled();
  });

  it('removes a winery when in edit mode', async () => {
    render(<TripCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const removeBtn = screen.getAllByRole('button').find(b => b.className.includes('text-red-500'));
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(mockRemoveWineryFromTrip).toHaveBeenCalledWith('1', 101);
  });

  it('opens the global note editor when clicking add/edit notes', async () => {
    render(<TripCard {...defaultProps} />);
    const notesBtn = screen.getByRole('button', { name: /Add Notes/i });
    fireEvent.click(notesBtn);
    
    expect(mockOpenWineryNoteEditor).toHaveBeenCalledWith(
      101, 
      '', 
      mockSaveWineryNote
    );
  });

  it('performs reordering via handleDrop', async () => {
    const tripWithTwo = {
      ...mockTrip,
      wineries: [
        ...mockTrip.wineries!,
        { id: 'winery-2', dbId: 102, name: 'Winery Two' }
      ]
    };
    render(<TripCard {...defaultProps} trip={tripWithTwo as any} />);
    fireEvent.click(screen.getByTestId('dnd-context'));
    expect(mockUpdateWineryOrder).toHaveBeenCalledWith('1', [102, 101]);
  });

  it('renders search results from props', async () => {
    const mockSearchResults = [{ id: 'winery-2', dbId: 102, name: 'Search Result', address: '456 Wine Ave' }];
    render(<TripCard {...defaultProps} searchResults={mockSearchResults as any} />);
    
    fireEvent.click(screen.getByLabelText(/Edit Trip/i));
    fireEvent.click(screen.getByText(/Add a Winery/i));
    expect(screen.getByText('Search Result')).toBeInTheDocument();
  });
});
