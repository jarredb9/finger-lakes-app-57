import { render, screen } from '@testing-library/react';
import { ExploreTabContent } from '../explore-tab-content';
import { useWineryMapContext } from '@/components/winery-map-context';

jest.mock('@/components/winery-map-context', () => ({
  useWineryMapContext: jest.fn(),
}));

jest.mock('@/components/map/map-controls', () => ({
  MapControls: () => <div data-testid="mock-map-controls">Map Controls</div>,
}));

jest.mock('@/components/map/map-legend-popover', () => ({
  MapLegendPopover: () => <div data-testid="mock-map-legend-popover">Map Legend Popover</div>,
}));

jest.mock('@/components/map/WinerySearchResults', () => ({
  __esModule: true,
  default: ({ listResultsInView, isSearching }: any) => (
    <div data-testid="mock-winery-search-results">
      Search Results ({listResultsInView?.length || 0} items, searching: {String(isSearching)})
    </div>
  ),
}));

const mockedUseWineryMapContext = useWineryMapContext as jest.MockedFunction<typeof useWineryMapContext>;

describe('ExploreTabContent Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders MapControls, MapLegendPopover, and WinerySearchResults consuming context', () => {
    mockedUseWineryMapContext.mockReturnValue({
      listResultsInView: [
        { id: 1, name: 'Dr. Konstantin Frank' } as any,
        { id: 2, name: 'Hermann J. Wiemer' } as any,
      ],
      isSearching: false,
      handleOpenModal: jest.fn(),
      hitApiLimit: false,
      searchLocation: '',
      setSearchLocation: jest.fn(),
      autoSearch: false,
      setAutoSearch: jest.fn(),
      handleSearchSubmit: jest.fn(),
      handleManualSearchArea: jest.fn(),
      filter: ['all'],
      handleFilterChange: jest.fn(),
      handlePlaceSelect: jest.fn(),
    } as any);

    render(<ExploreTabContent />);

    expect(screen.getByTestId('explore-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('mock-map-controls')).toBeInTheDocument();
    expect(screen.getByText('Wineries in View')).toBeInTheDocument();
    expect(screen.getByTestId('mock-map-legend-popover')).toBeInTheDocument();
    expect(screen.getByTestId('mock-winery-search-results')).toHaveTextContent('Search Results (2 items, searching: false)');
  });

  it('renders correctly during searching state', () => {
    mockedUseWineryMapContext.mockReturnValue({
      listResultsInView: [],
      isSearching: true,
      handleOpenModal: jest.fn(),
      hitApiLimit: false,
      searchLocation: '',
      setSearchLocation: jest.fn(),
      autoSearch: false,
      setAutoSearch: jest.fn(),
      handleSearchSubmit: jest.fn(),
      handleManualSearchArea: jest.fn(),
      filter: ['all'],
      handleFilterChange: jest.fn(),
      handlePlaceSelect: jest.fn(),
    } as any);

    render(<ExploreTabContent />);

    expect(screen.getByTestId('mock-winery-search-results')).toHaveTextContent('Search Results (0 items, searching: true)');
  });
});
