import { render, screen, fireEvent, act } from '@testing-library/react';
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
    friends: [],
    selectedFriends: [],
    currentMembers: [],
    handleExportToMaps: mockHandleExportToMaps,
    toggleFriendSelection: mockToggleFriendSelection,
  }),
}));

// Mock UI components simply but functionally
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/command', () => ({
  Command: ({ children }: any) => <div>{children}</div>,
  CommandInput: (props: any) => <input {...props} />,
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: () => <div>No friends found.</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: any) => <div onClick={onSelect}>{children}</div>,
}));

// Functional Button mock so we can click it and use aria-label
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div>{children}</div>,
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
  const DatePicker = () => <div data-testid="date-picker" />;
  DatePicker.displayName = 'DatePicker';
  return { DatePicker };
});

jest.mock('../DailyHours', () => {
  const DailyHours = () => null;
  DailyHours.displayName = 'DailyHours';
  return DailyHours;
});
jest.mock('../WineryNoteEditor', () => {
  const WineryNoteEditor = () => null;
  WineryNoteEditor.displayName = 'WineryNoteEditor';
  return WineryNoteEditor;
});

describe('TripCard', () => {
  const mockTrip: any = {
    id: 1,
    name: 'Test Trip',
    trip_date: '2026-03-05',
    user_id: 'user-1',
    wineries: [],
    members: ['user-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<TripCard trip={mockTrip} />);
    expect(screen.getByText(/Test Trip/i)).toBeInTheDocument();
  });

  it('triggers deleteTrip when delete button is clicked', () => {
    render(<TripCard trip={mockTrip} />);
    const deleteButton = screen.getByLabelText(/Delete Trip/i);
    fireEvent.click(deleteButton);
    expect(mockDeleteTrip).toHaveBeenCalledWith('1');
  });

  it('opens share dialog when share button is clicked', () => {
    render(<TripCard trip={mockTrip} />);
    const shareButton = screen.getByLabelText(/Share Trip/i);
    fireEvent.click(shareButton);
    expect(screen.getByTestId('trip-share-dialog')).toBeInTheDocument();
  });

  it('switches to editing mode when Edit Trip is clicked', () => {
    render(<TripCard trip={mockTrip} />);
    const editButton = screen.getByRole('button', { name: /Edit Trip/i });
    fireEvent.click(editButton);
    
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Trip Name/i)).toBeInTheDocument();
  });

  it('calls updateTrip and exits edit mode when Save Changes is clicked', async () => {
    mockUpdateTrip.mockResolvedValue({ success: true });
    render(<TripCard trip={mockTrip} />);
    
    // Enter edit mode
    fireEvent.click(screen.getByRole('button', { name: /Edit Trip/i }));
    
    // Change name
    const input = screen.getByPlaceholderText(/Trip Name/i);
    fireEvent.change(input, { target: { value: 'Updated Trip Name' } });
    
    // Save
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    });
    
    expect(mockUpdateTrip).toHaveBeenCalledWith('1', expect.objectContaining({
      name: 'Updated Trip Name'
    }));
    
    // Should be back in view mode (Edit Trip button visible)
    expect(screen.getByRole('button', { name: /Edit Trip/i })).toBeInTheDocument();
  });
});
