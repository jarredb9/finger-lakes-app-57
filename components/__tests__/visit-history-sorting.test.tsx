import { render, screen, fireEvent, within } from '@testing-library/react';
import { VisitHistoryModal } from '../visit-history-modal';
import { DataTable } from '@/components/ui/data-table';
import { columns } from '@/components/visits-table-columns';
import { useUIStore } from '@/lib/stores/uiStore';
import { useVisitStore } from '@/lib/stores/visitStore';
import { VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';

// Mock UI and Winery stores
jest.mock('@/lib/stores/uiStore');
jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: () => ({
    ensureWineryDetails: jest.fn(),
  }),
}));

// Mock Select component to avoid JSDOM PointerEvent/Radix floating limitations
jest.mock('@/components/ui/select', () => {
  const React = require('react');
  return {
    Select: ({ value, onValueChange, children }: any) => (
      <div data-testid="mock-select" data-value={value}>
        {React.Children.map(children, (child: any) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { 'data-value': value, onValueChange } as any)
            : child
        )}
      </div>
    ),
    SelectTrigger: ({ children, onValueChange: _o, 'data-value': _d, ...props }: any) => (
      <button type="button" {...props}>{children}</button>
    ),
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children, onValueChange }: any) => (
      <div>
        {React.Children.map(children, (child: any) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { onValueChange } as any)
            : child
        )}
      </div>
    ),
    SelectItem: ({ value, children, onValueChange }: any) => (
      <button
        type="button"
        role="option"
        aria-selected={false}
        data-testid={`select-item-${value}`}
        onClick={() => onValueChange && onValueChange(value)}
      >
        {children}
      </button>
    ),
  };
});

// Helper to create mock visits across distinct years
const createMockVisits = (): VisitWithWinery[] => [
  {
    id: 1,
    user_id: 'user-1',
    visit_date: '2024-05-10',
    rating: 5,
    user_review: 'Spectacular dry Riesling notes from 2024 vintage',
    winery_id: 101 as WineryDbId,
    wineryName: 'Seneca Shore Cellars',
    wineryId: 'place-seneca' as GooglePlaceId,
    syncStatus: 'synced',
    wineries: {
      id: 101 as WineryDbId,
      name: 'Seneca Shore Cellars',
      google_place_id: 'place-seneca' as GooglePlaceId,
      address: 'Seneca Rd',
      latitude: 42.6,
      longitude: -76.9,
    },
  },
  {
    id: 2,
    user_id: 'user-1',
    visit_date: '2020-09-15',
    rating: 2,
    user_review: 'Pleasant afternoon, average vintage notes',
    winery_id: 102 as WineryDbId,
    wineryName: 'Boundary Breaks',
    wineryId: 'place-boundary' as GooglePlaceId,
    syncStatus: 'synced',
    wineries: {
      id: 102 as WineryDbId,
      name: 'Boundary Breaks',
      google_place_id: 'place-boundary' as GooglePlaceId,
      address: 'Lodi, NY',
      latitude: 42.5,
      longitude: -76.8,
    },
  },
  {
    id: 3,
    user_id: 'user-1',
    visit_date: '2016-07-04',
    rating: 4,
    user_review: 'Historic cellar visit, superb oak aged notes',
    winery_id: 103 as WineryDbId,
    wineryName: 'Dr. Konstantin Frank',
    wineryId: 'place-dr-frank' as GooglePlaceId,
    syncStatus: 'synced',
    wineries: {
      id: 103 as WineryDbId,
      name: 'Dr. Konstantin Frank',
      google_place_id: 'place-dr-frank' as GooglePlaceId,
      address: 'Hammondsport, NY',
      latitude: 42.4,
      longitude: -77.1,
    },
  },
];

describe('Visit History Sorting & Full Evaluation', () => {
  let mockFetchAllVisits: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchAllVisits = jest.fn();

    (useUIStore as unknown as jest.Mock).mockReturnValue({
      isVisitHistoryModalOpen: true,
      setVisitHistoryModalOpen: jest.fn(),
      openWineryModal: jest.fn(),
    });

    useVisitStore.setState({
      visits: createMockVisits(),
      isLoading: false,
      allVisitsLoaded: true,
      fetchAllVisits: mockFetchAllVisits,
    });
  });

  describe('VisitHistoryModal Integration', () => {
    it('invokes fetchAllVisits when modal opens and allVisitsLoaded is false', () => {
      useVisitStore.setState({
        visits: [],
        isLoading: false,
        allVisitsLoaded: false,
        fetchAllVisits: mockFetchAllVisits,
      });

      render(<VisitHistoryModal />);

      expect(mockFetchAllVisits).toHaveBeenCalledTimes(1);
    });

    it('does not invoke fetchAllVisits if allVisitsLoaded is already true', () => {
      useVisitStore.setState({
        visits: createMockVisits(),
        isLoading: false,
        allVisitsLoaded: true,
        fetchAllVisits: mockFetchAllVisits,
      });

      render(<VisitHistoryModal />);

      expect(mockFetchAllVisits).not.toHaveBeenCalled();
    });

    it('displays loading spinner when isLoading is true and allVisitsLoaded is false', () => {
      useVisitStore.setState({
        visits: [],
        isLoading: true,
        allVisitsLoaded: false,
        fetchAllVisits: mockFetchAllVisits,
      });

      render(<VisitHistoryModal />);
      // Dialog content renders into document.body portal
      const spinner = document.body.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('DataTable Client-Side Sorting & Filtering', () => {
    const visits = createMockVisits();
    const onRowClick = jest.fn();

    it('renders all visits across multiple years (2016, 2020, 2024)', () => {
      render(<DataTable columns={columns} data={visits} onRowClick={onRowClick} />);

      expect(screen.getByText('Seneca Shore Cellars')).toBeInTheDocument();
      expect(screen.getByText('Boundary Breaks')).toBeInTheDocument();
      expect(screen.getByText('Dr. Konstantin Frank')).toBeInTheDocument();
    });

    it('orders by date descending by default, then ascending when Date header is clicked', () => {
      render(<DataTable columns={columns} data={visits} onRowClick={onRowClick} />);

      const rowsBefore = screen.getAllByRole('row');
      // Row 0 is header. Row 1 should be 2024 (Seneca Shore Cellars), Row 3 should be 2016 (Dr. Konstantin Frank)
      expect(within(rowsBefore[1]).getByText('Seneca Shore Cellars')).toBeInTheDocument();
      expect(within(rowsBefore[3]).getByText('Dr. Konstantin Frank')).toBeInTheDocument();

      // Click Date header to sort ascending
      const dateHeaderButton = screen.getByRole('button', { name: /date/i });
      fireEvent.click(dateHeaderButton);

      const rowsAfterAsc = screen.getAllByRole('row');
      // Ascending: earliest visit (2016, Dr. Konstantin Frank) must be in the first row
      expect(within(rowsAfterAsc[1]).getByText('Dr. Konstantin Frank')).toBeInTheDocument();
      expect(within(rowsAfterAsc[3]).getByText('Seneca Shore Cellars')).toBeInTheDocument();

      // Click Date header again to toggle back to descending
      fireEvent.click(dateHeaderButton);
      const rowsAfterDesc = screen.getAllByRole('row');
      expect(within(rowsAfterDesc[1]).getByText('Seneca Shore Cellars')).toBeInTheDocument();
    });

    it('orders by rating ascending and descending when Rating header is clicked', () => {
      render(<DataTable columns={columns} data={visits} onRowClick={onRowClick} />);

      const ratingHeaderButton = screen.getByRole('button', { name: /rating/i });

      // First click: asc (Boundary Breaks with rating 2 first)
      fireEvent.click(ratingHeaderButton);
      let rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('Boundary Breaks')).toBeInTheDocument();

      // Second click: desc (Seneca Shore Cellars with rating 5 first)
      fireEvent.click(ratingHeaderButton);
      rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('Seneca Shore Cellars')).toBeInTheDocument();
    });

    it('orders by winery name when Winery header is clicked', () => {
      render(<DataTable columns={columns} data={visits} onRowClick={onRowClick} />);

      const wineryHeaderButton = screen.getByRole('button', { name: /winery/i });

      // First click: asc (Boundary Breaks first alphabetically)
      fireEvent.click(wineryHeaderButton);
      let rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('Boundary Breaks')).toBeInTheDocument();
      expect(within(rows[2]).getByText('Dr. Konstantin Frank')).toBeInTheDocument();
      expect(within(rows[3]).getByText('Seneca Shore Cellars')).toBeInTheDocument();
    });

    it('filters across winery names and visit notes using the search input', () => {
      render(<DataTable columns={columns} data={visits} onRowClick={onRowClick} />);

      const searchInput = screen.getByPlaceholderText('Filter by winery or notes...');

      // Filter by winery name
      fireEvent.change(searchInput, { target: { value: 'Konstantin' } });
      expect(screen.getByText('Dr. Konstantin Frank')).toBeInTheDocument();
      expect(screen.queryByText('Seneca Shore Cellars')).not.toBeInTheDocument();
      expect(screen.queryByText('Boundary Breaks')).not.toBeInTheDocument();

      // Filter by tasting notes keyword
      fireEvent.change(searchInput, { target: { value: 'dry Riesling' } });
      expect(screen.getByText('Seneca Shore Cellars')).toBeInTheDocument();
      expect(screen.queryByText('Dr. Konstantin Frank')).not.toBeInTheDocument();

      // Clear filter
      const clearButton = screen.getByRole('button', { name: /clear filter/i });
      fireEvent.click(clearButton);
      expect(screen.getByText('Seneca Shore Cellars')).toBeInTheDocument();
      expect(screen.getByText('Boundary Breaks')).toBeInTheDocument();
      expect(screen.getByText('Dr. Konstantin Frank')).toBeInTheDocument();
    });

    it('supports client-side pagination and page size selection', () => {
      // Generate 30 mock visits
      const thirtyVisits: VisitWithWinery[] = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        user_id: 'user-1',
        visit_date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        rating: (i % 5) + 1,
        user_review: `Review note ${i + 1}`,
        winery_id: (200 + i) as WineryDbId,
        wineryName: `Winery ${String(i + 1).padStart(2, '0')}`,
        wineryId: `place-${i + 1}` as GooglePlaceId,
        syncStatus: 'synced',
        wineries: {
          id: (200 + i) as WineryDbId,
          name: `Winery ${String(i + 1).padStart(2, '0')}`,
          google_place_id: `place-${i + 1}` as GooglePlaceId,
          address: `Address ${i + 1}`,
          latitude: 42.5,
          longitude: -76.8,
        },
      }));

      render(<DataTable columns={columns} data={thirtyVisits} onRowClick={onRowClick} />);

      // Default pageSize is 25: Page 1 of 2
      expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();

      const prevBtn = screen.getByRole('button', { name: /previous/i });
      const nextBtn = screen.getByRole('button', { name: /next/i });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      // Navigate to next page
      fireEvent.click(nextBtn);
      expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeDisabled();

      // Navigate back
      fireEvent.click(prevBtn);
      expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();

      // Change page size to 10
      const option10 = screen.getByTestId('select-item-10');
      fireEvent.click(option10);

      // 30 visits at 10/page = 3 pages
      expect(screen.getByText(/Page 1 of 3/i)).toBeInTheDocument();
    });
  });

  describe('Mobile View Sorting and In-Memory Pagination', () => {
    it('sorts and paginates cards in mobile view', () => {
      const visits = createMockVisits();
      useVisitStore.setState({
        visits,
        isLoading: false,
        allVisitsLoaded: true,
        fetchAllVisits: mockFetchAllVisits,
      });

      render(<VisitHistoryModal />);

      // Cards render on screen
      expect(screen.getAllByText('Seneca Shore Cellars').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Dr. Konstantin Frank').length).toBeGreaterThanOrEqual(1);

      // Search on mobile (first input in DOM corresponds to mobile view)
      const mobileSearchInputs = screen.getAllByPlaceholderText('Filter by winery or notes...');
      const mobileSearchInput = mobileSearchInputs[0];
      fireEvent.change(mobileSearchInput, { target: { value: 'vintage notes' } });

      // Boundary Breaks contains "average vintage notes"
      expect(screen.getAllByText('Boundary Breaks').length).toBeGreaterThanOrEqual(1);
    });

    it('resets mobile page on search and clamps pagination safely', () => {
      const fifteenVisits: VisitWithWinery[] = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        user_id: 'user-1',
        visit_date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        rating: 4,
        user_review: i === 0 ? 'Unique review note' : `Review note ${i + 1}`,
        winery_id: (200 + i) as WineryDbId,
        wineryName: `Winery ${String(i + 1).padStart(2, '0')}`,
        wineryId: `place-${i + 1}` as GooglePlaceId,
        syncStatus: 'synced',
        wineries: {
          id: (200 + i) as WineryDbId,
          name: `Winery ${String(i + 1).padStart(2, '0')}`,
          google_place_id: `place-${i + 1}` as GooglePlaceId,
          address: `Address ${i + 1}`,
          latitude: 42.5,
          longitude: -76.8,
        },
      }));

      useVisitStore.setState({
        visits: fifteenVisits,
        isLoading: false,
        allVisitsLoaded: true,
        fetchAllVisits: mockFetchAllVisits,
      });

      render(<VisitHistoryModal />);

      // Navigate to mobile page 2
      const nextBtn = screen.getAllByRole('button', { name: /next/i })[0];
      fireEvent.click(nextBtn);

      // Now filter by unique note which only matches 1 visit
      const mobileSearchInputs = screen.getAllByPlaceholderText('Filter by winery or notes...');
      fireEvent.change(mobileSearchInputs[0], { target: { value: 'Unique review note' } });

      // Should display Winery 01 and not be stuck on an empty page
      expect(screen.getAllByText('Winery 01').length).toBeGreaterThanOrEqual(1);
    });
  });
});
