import { render, screen } from '@testing-library/react';
import VisitCardHistory from '../VisitCardHistory';
import TripCard from '../TripCardPresentational';
import { createMockVisit, createMockTrip, createMockTripMember } from '../../test/factories/dataFactory';

// Mock UI components as in existing tests
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => children,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
  AvatarImage: ({ src }: any) => <img src={src} alt="avatar" />,
  AvatarFallback: ({ children }: any) => <div>{children}</div>,
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

describe('Sync Indicators', () => {
  describe('VisitCardHistory', () => {
    it('displays "Pending" badge and opacity-50 when syncStatus is pending', () => {
      const visits = [
        createMockVisit({ 
          id: '1' as any, 
          visit_date: '2026-03-01', 
          syncStatus: 'pending' 
        }),
      ];
      
      render(<VisitCardHistory visits={visits} />);
      
      const card = screen.getByTestId('visit-card');
      expect(card).toHaveClass('opacity-50');
      expect(screen.getByText(/Pending/i)).toBeInTheDocument();
    });

    it('does not display "Pending" badge when syncStatus is synced', () => {
      const visits = [
        createMockVisit({ 
          id: '1' as any, 
          visit_date: '2026-03-01', 
          syncStatus: 'synced' 
        }),
      ];
      
      render(<VisitCardHistory visits={visits} />);
      
      const card = screen.getByTestId('visit-card');
      expect(card).not.toHaveClass('opacity-50');
      expect(screen.queryByText(/Pending/i)).not.toBeInTheDocument();
    });
  });

  describe('TripCard', () => {
    const mockTrip = createMockTrip({
      id: 1,
      name: 'Test Trip',
      syncStatus: 'pending',
      wineries: [],
    });

    const mockMembers = [
      createMockTripMember({ id: 'user-1', name: 'You', email: 'you@example.com' }),
    ];

    const defaultProps = {
      trip: mockTrip,
      isOwner: true,
      canEdit: true,
      currentMembers: mockMembers,
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

    it('displays "Pending" badge and opacity-50 when syncStatus is pending', () => {
      render(<TripCard {...defaultProps} />);
      
      const card = screen.getByTestId('trip-details-card');
      expect(card).toHaveClass('opacity-50');
      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
    });

    it('does not display "Pending" badge when syncStatus is synced', () => {
      const syncedTrip = { ...mockTrip, syncStatus: 'synced' as const };
      render(<TripCard {...defaultProps} trip={syncedTrip} />);
      
      const card = screen.getByTestId('trip-details-card');
      expect(card).not.toHaveClass('opacity-50');
      expect(screen.queryByText(/Syncing/i)).not.toBeInTheDocument();
    });
  });
});
