import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import TripCard from '../trip-card';

// Define stable mocks outside the component to prevent re-render loops
const mockUpdateTrip = jest.fn();
const mockDeleteTrip = jest.fn();
const mockUpdateWineryOrder = jest.fn();
const mockToggleWineryOnTrip = jest.fn();
const mockRemoveWineryFromTrip = jest.fn();
const mockSaveWineryNote = jest.fn();
const mockAddMembersToTrip = jest.fn();

jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: () => ({
    updateTrip: mockUpdateTrip,
    deleteTrip: mockDeleteTrip,
    updateWineryOrder: mockUpdateWineryOrder,
    toggleWineryOnTrip: mockToggleWineryOnTrip,
    removeWineryFromTrip: mockRemoveWineryFromTrip,
    saveWineryNote: mockSaveWineryNote,
    addMembersToTrip: mockAddMembersToTrip,
  }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const mockHandleExportToMaps = jest.fn();
const mockToggleFriendSelection = jest.fn();
jest.mock('@/hooks/use-trip-actions', () => ({
  useTripActions: () => ({
    friends: [
      { id: 'friend-1', name: 'Friend One', email: 'one@example.com' }
    ],
    selectedFriends: [],
    currentMembers: [
      { id: 'friend-1', name: 'Friend One', email: 'one@example.com' }
    ],
    handleExportToMaps: mockHandleExportToMaps,
    toggleFriendSelection: mockToggleFriendSelection,
  }),
}));

// Mock UI components simply but functionally
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

// Functional Button mock
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

// Functional DnD mock to trigger handleDrop
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

jest.mock('../TripShareDialog', () => {
  const TripShareDialog = ({ isOpen }: any) => isOpen ? <div data-testid="trip-share-dialog" /> : null;
  TripShareDialog.displayName = 'TripShareDialog';
  return { TripShareDialog };
});

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

jest.mock('../WineryNoteEditor', () => {
  const WineryNoteEditor = ({ onSave, wineryDbId }: any) => (
    <button data-testid="save-note-btn" onClick={() => onSave(wineryDbId, 'New Note')}>Save Note</button>
  );
  WineryNoteEditor.displayName = 'WineryNoteEditor';
  return WineryNoteEditor;
});

describe('TripCard', () => {
  const mockTrip: any = {
    id: 1,
    name: 'Test Trip',
    trip_date: '2026-03-05',
    user_id: 'user-1',
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
      }
    ],
    members: ['user-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTrip.mockResolvedValue({ success: true });
    mockDeleteTrip.mockResolvedValue({ success: true });
    mockRemoveWineryFromTrip.mockResolvedValue({ success: true });
    mockSaveWineryNote.mockResolvedValue({ success: true });
    mockAddMembersToTrip.mockResolvedValue({ success: true });
  });

  it('renders correctly including reviews and distance', () => {
    const tripWithTwo = {
      ...mockTrip,
      wineries: [
        ...mockTrip.wineries,
        { id: 'winery-2', dbId: 102, name: 'Winery Two', lat: 42.45, lng: -76.51 }
      ]
    };
    render(<TripCard trip={tripWithTwo} />);
    expect(screen.getByText(/Test Trip/i)).toBeInTheDocument();
    expect(screen.getByText(/Winery One/i)).toBeInTheDocument();
    expect(screen.getByText(/Great!/i)).toBeInTheDocument();
    expect(screen.getByText(/to next stop/i)).toBeInTheDocument();
  });

  it('triggers deleteTrip when delete button is clicked', async () => {
    render(<TripCard trip={mockTrip} />);
    const deleteButton = screen.getByLabelText(/Delete Trip/i);
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(mockDeleteTrip).toHaveBeenCalledWith('1');
  });

  it('handles deleteTrip error', async () => {
    mockDeleteTrip.mockRejectedValue(new Error('Delete failed'));
    render(<TripCard trip={mockTrip} />);
    const deleteButton = screen.getByLabelText(/Delete Trip/i);
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(mockDeleteTrip).toHaveBeenCalled();
  });

  it('opens share dialog when share button is clicked', () => {
    render(<TripCard trip={mockTrip} />);
    const shareButton = screen.getByLabelText(/Share Trip/i);
    fireEvent.click(shareButton);
    expect(screen.getByTestId('trip-share-dialog')).toBeInTheDocument();
  });

  it('switches to editing mode and saves changes', async () => {
    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const input = screen.getByPlaceholderText(/Trip Name/i);
    fireEvent.change(input, { target: { value: 'Updated Name' } });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    
    expect(mockUpdateTrip).toHaveBeenCalledWith('1', expect.objectContaining({ name: 'Updated Name' }));
  });

  it('handles updateTrip error', async () => {
    mockUpdateTrip.mockRejectedValue(new Error('Update failed'));
    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: "Failed to update trip."
    }));
  });

  it('handles empty date validation in handleSave', async () => {
    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    fireEvent.click(screen.getByTestId('date-picker'));
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: "Trip date cannot be empty."
    }));
  });

  it('removes a winery when in edit mode', async () => {
    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const removeBtn = screen.getAllByRole('button').find(b => b.className.includes('text-red-500'));
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(mockRemoveWineryFromTrip).toHaveBeenCalledWith('1', 101);
  });

  it('handles removeWineryFromTrip error', async () => {
    mockRemoveWineryFromTrip.mockRejectedValue(new Error('Remove failed'));
    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const removeBtn = screen.getAllByRole('button').find(b => b.className.includes('text-red-500'));
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to remove winery." }));
  });

  it('saves a note via WineryNoteEditor', async () => {
    render(<TripCard trip={mockTrip} />);
    const saveNoteBtn = screen.getByTestId('save-note-btn');
    await act(async () => {
      fireEvent.click(saveNoteBtn);
    });
    expect(mockSaveWineryNote).toHaveBeenCalledWith('1', 101, 'New Note');
  });

  it('handles saveWineryNote error', async () => {
    mockSaveWineryNote.mockRejectedValue(new Error('Save failed'));
    render(<TripCard trip={mockTrip} />);
    const saveNoteBtn = screen.getByTestId('save-note-btn');
    await act(async () => {
      fireEvent.click(saveNoteBtn);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to save notes." }));
  });

  it('performs reordering via handleDrop', async () => {
    const tripWithTwo = {
      ...mockTrip,
      wineries: [
        ...mockTrip.wineries,
        { id: 'winery-2', dbId: 102, name: 'Winery Two' }
      ]
    };
    render(<TripCard trip={tripWithTwo} />);
    fireEvent.click(screen.getByTestId('dnd-context'));
    expect(mockUpdateWineryOrder).toHaveBeenCalledWith('1', [102, 101]);
  });

  it('handles friend selection success and error', async () => {
    mockToggleFriendSelection.mockReturnValue(['friend-1']);
    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const friendItem = screen.getByTestId('friend-item-friend-1');
    await act(async () => {
      fireEvent.click(friendItem);
    });
    expect(mockToggleFriendSelection).toHaveBeenCalledWith('friend-1');
    expect(mockAddMembersToTrip).toHaveBeenCalledWith('1', ['friend-1']);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Trip members updated." }));

    mockAddMembersToTrip.mockRejectedValue(new Error('Update failed'));
    await act(async () => {
      fireEvent.click(friendItem);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to update members." }));
  });

  it('performs winery search and adds result', async () => {
    const mockWinery = { id: 'winery-2', dbId: 102, name: 'Search Result', address: '456 Wine Ave' };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([mockWinery])
    });
    global.fetch = mockFetch;

    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const searchInput = screen.getByPlaceholderText(/Search wineries.../i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Search' } });
    });
    
    await waitFor(() => { expect(mockFetch).toHaveBeenCalled(); }, { timeout: 2000 });

    const searchResultItem = await screen.findByText('Search Result');
    await act(async () => {
      fireEvent.click(searchResultItem);
    });
    expect(mockToggleWineryOnTrip).toHaveBeenCalledWith(mockWinery, mockTrip);
  });

  it('handles winery search error (response not ok) and add error', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false });
    global.fetch = mockFetch;

    render(<TripCard trip={mockTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    const searchInput = screen.getByPlaceholderText(/Search wineries.../i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Error' } });
    });
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Winery search failed." }));
    });

    // Test add error
    const mockWinery = { id: 'winery-2', dbId: 102, name: 'Search Result' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([mockWinery])
    });
    mockToggleWineryOnTrip.mockImplementation(() => { throw new Error('Add failed'); });

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Fail' } });
    });
    const searchResultItem = await screen.findByText('Search Result');
    await act(async () => {
      fireEvent.click(searchResultItem);
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to add Search Result." }));
  });
});
