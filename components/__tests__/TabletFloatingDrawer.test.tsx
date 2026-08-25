import { render, screen, fireEvent } from '@testing-library/react';
import { TabletFloatingDrawer } from '../layout/TabletFloatingDrawer';
import { AuthenticatedUser } from '@/lib/types';
import { useMapStore } from '@/lib/stores/mapStore';

// Mock AppSidebar
jest.mock('@/components/app-sidebar', () => ({
  AppSidebar: ({ activeTab, onTabChange }: any) => (
    <div data-testid="mock-app-sidebar">
      <span>Current Tab: {activeTab}</span>
      <button onClick={() => onTabChange('trips')}>Switch to Trips</button>
    </div>
  ),
}));

// Mock winery map context if used
jest.mock('@/components/winery-map-context', () => ({
  useWineryMapContext: () => ({
    searchLocation: 'Geneva, NY',
    filter: ['all', 'allowsDogs'],
    listResultsInView: [],
    isSearching: false,
    autoSearch: false,
    hitApiLimit: false,
    handleSearchSubmit: jest.fn(),
    handleManualSearchArea: jest.fn(),
    setAutoSearch: jest.fn(),
    setSearchLocation: jest.fn(),
    handleFilterChange: jest.fn(),
    handleOpenModal: jest.fn(),
  }),
}));

const mockUser: AuthenticatedUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Wine Explorer',
};

describe('TabletFloatingDrawer Component', () => {
  beforeEach(() => {
    useMapStore.setState({
      filter: ['all'],
      searchLocation: '',
    });
  });

  it('renders in expanded state by default with AppSidebar and collapse button', () => {
    render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="explore"
        onTabChange={jest.fn()}
      />
    );

    const drawer = screen.getByTestId('tablet-floating-drawer');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute('data-state', 'expanded');
    expect(screen.getByTestId('mock-app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('tablet-drawer-collapse-button')).toBeInTheDocument();
  });

  it('collapses into a pill bar when the collapse button is clicked', () => {
    const onCollapsedChange = jest.fn();
    render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="explore"
        onCollapsedChange={onCollapsedChange}
      />
    );

    const collapseButton = screen.getByTestId('tablet-drawer-collapse-button');
    fireEvent.click(collapseButton);

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('renders collapsed pill bar when isCollapsed is true', () => {
    useMapStore.setState({
      filter: ['allowsDogs', 'outdoorSeating'],
      searchLocation: 'Keuka Lake',
    });

    render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="explore"
        isCollapsed={true}
        onCollapsedChange={jest.fn()}
      />
    );

    const drawer = screen.getByTestId('tablet-floating-drawer');
    expect(drawer).toHaveAttribute('data-state', 'collapsed');
    expect(screen.queryByTestId('mock-app-sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('tablet-drawer-expand-button')).toBeInTheDocument();
  });

  it('displays search summary and active filter badge in collapsed state', () => {
    useMapStore.setState({
      filter: ['allowsDogs', 'outdoorSeating'],
      searchLocation: 'Keuka Lake',
    });

    render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="explore"
        isCollapsed={true}
        onCollapsedChange={jest.fn()}
      />
    );

    expect(screen.getByText(/Keuka Lake/i)).toBeInTheDocument();
    const filterBadge = screen.getByTestId('tablet-filter-badge');
    expect(filterBadge).toBeInTheDocument();
    expect(filterBadge).toHaveTextContent('2');
  });

  it('expands when clicking the expand button in collapsed state', () => {
    const onCollapsedChange = jest.fn();
    render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="explore"
        isCollapsed={true}
        onCollapsedChange={onCollapsedChange}
      />
    );

    const expandButton = screen.getByTestId('tablet-drawer-expand-button');
    fireEvent.click(expandButton);

    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('handles clicking the collapsed pill directly to expand in uncontrolled mode', () => {
    render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="explore"
      />
    );

    const collapseButton = screen.getByTestId('tablet-drawer-collapse-button');
    fireEvent.click(collapseButton);

    const collapsedPill = screen.getByTestId('tablet-floating-drawer');
    expect(collapsedPill).toHaveAttribute('data-state', 'collapsed');

    fireEvent.click(collapsedPill);
    expect(screen.getByTestId('tablet-floating-drawer')).toHaveAttribute('data-state', 'expanded');
  });

  it('renders tab-specific label when activeTab is not explore', () => {
    const { rerender } = render(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="trips"
        isCollapsed={true}
      />
    );
    expect(screen.getByText('Trips')).toBeInTheDocument();

    rerender(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="friends"
        isCollapsed={true}
      />
    );
    expect(screen.getByText('Friends')).toBeInTheDocument();

    rerender(
      <TabletFloatingDrawer
        user={mockUser}
        activeTab="history"
        isCollapsed={true}
      />
    );
    expect(screen.getByText('History')).toBeInTheDocument();
  });
});
