import { render, screen, fireEvent } from '@testing-library/react';
import { DesktopWineryModal } from '../desktop-winery-modal';
import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';

// Mock subcomponents
jest.mock('../hero-photo-carousel', () => ({
  HeroPhotoCarousel: ({ winery, onPhotoClick }: any) => (
    <div data-testid="mock-hero-carousel" onClick={() => onPhotoClick?.('photo-1')}>
      {winery.name}
    </div>
  ),
  __esModule: true,
  default: ({ winery, onPhotoClick }: any) => (
    <div data-testid="mock-hero-carousel" onClick={() => onPhotoClick?.('photo-1')}>
      {winery.name}
    </div>
  ),
}));

jest.mock('../photo-lightbox-modal', () => ({
  PhotoLightboxModal: ({ photoRef }: any) => (
    photoRef ? <div data-testid="mock-lightbox">{photoRef}</div> : null
  ),
  __esModule: true,
  default: ({ photoRef }: any) => (
    photoRef ? <div data-testid="mock-lightbox">{photoRef}</div> : null
  ),
}));

jest.mock('../../WineryDetails', () => ({
  WineryDetails: ({ mode }: any) => <div data-testid={`mock-winery-details-${mode}`} />,
}));

jest.mock('../../WineryActionsPresentational', () => ({
  WineryActionsPresentational: () => <div data-testid="mock-winery-actions" />,
}));

jest.mock('../../WineryCommunityTab', () => ({
  WineryCommunityTab: () => <div data-testid="mock-community-tab" />,
}));

jest.mock('../../WineryVarietalsTab', () => ({
  WineryVarietalsTab: () => <div data-testid="mock-varietals-tab" />,
}));

jest.mock('../../WineryWeatherWidget', () => ({
  WineryWeatherWidget: () => <div data-testid="mock-weather-widget" />,
}));

jest.mock('../../TripPlannerSection', () => ({
  TripPlannerSection: () => <div data-testid="mock-trip-planner" />,
  __esModule: true,
  default: () => <div data-testid="mock-trip-planner" />,
}));

jest.mock('../../VisitCardHistory', () => ({
  VisitCardHistory: () => <div data-testid="mock-visit-history" />,
  __esModule: true,
  default: () => <div data-testid="mock-visit-history" />,
}));

describe('DesktopWineryModal', () => {
  const mockWinery = createMockWinery({
    id: 'winery-1' as any,
    name: 'Ravines Wine Cellars',
    address: '400 Barracks Rd',
    rating: 4.8,
    latitude: 42.7,
    longitude: -76.9,
    trip_id: 123,
    trip_name: 'Summer Wine Tour',
    trip_date: '2026-08-20',
  });

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    winery: mockWinery,
    loadingWineryId: null,
    isLoading: false,
    isAIEnabled: true,
    lightboxPhoto: null,
    setLightboxPhoto: jest.fn(),
    activeTab: 'community' as const,
    effectiveActiveTab: 'community' as const,
    setActiveTab: jest.fn(),
    visits: [createMockVisit({ id: 'v1', visit_date: '2026-05-01' })],
    scrollContainerRef: { current: null },
    visitHistoryRef: { current: null },
    onLogVisit: jest.fn(),
    onStreetView: jest.fn(),
    onToggleWishlist: jest.fn(),
    onToggleFavorite: jest.fn(),
    onToggleFavoritePrivacy: jest.fn(),
    onToggleWishlistPrivacy: jest.fn(),
    onEditVisit: jest.fn(),
    onDeleteVisit: jest.fn(),
    onTripBadgeClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<DesktopWineryModal {...defaultProps} isLoading={true} />);

    const dialog = screen.getByTestId('winery-modal-dialog');
    expect(dialog).toHaveAttribute('data-state', 'loading');
    expect(screen.getByTestId('modal-left-column')).toBeInTheDocument();
    expect(screen.getByTestId('modal-right-column')).toBeInTheDocument();
  });

  it('renders winery details, columns, actions, and tabs when ready', () => {
    render(<DesktopWineryModal {...defaultProps} />);

    const dialog = screen.getByTestId('winery-modal-dialog');
    expect(dialog).toHaveAttribute('data-state', 'ready');
    expect(screen.getAllByText('Ravines Wine Cellars').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('400 Barracks Rd')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByTestId('modal-left-column')).toBeInTheDocument();
    expect(screen.getByTestId('modal-right-column')).toBeInTheDocument();
    expect(screen.getByTestId('mock-winery-actions')).toBeInTheDocument();
    expect(screen.getByTestId('mock-community-tab')).toBeInTheDocument();
  });

  it('renders trip badge and calls onTripBadgeClick when clicked', () => {
    render(<DesktopWineryModal {...defaultProps} />);

    const tripBadge = screen.getByTestId('trip-badge');
    expect(tripBadge).toBeInTheDocument();
    expect(tripBadge).toHaveTextContent('On Trip: Summer Wine Tour');

    fireEvent.click(tripBadge);
    expect(defaultProps.onTripBadgeClick).toHaveBeenCalledWith(123);
  });

  it('calls setActiveTab when a tab button is clicked', () => {
    render(<DesktopWineryModal {...defaultProps} />);

    const amenitiesTab = screen.getByRole('tab', { name: /amenities/i });
    fireEvent.click(amenitiesTab);
    expect(defaultProps.setActiveTab).toHaveBeenCalledWith('amenities');
  });

  it('does not render rating badge or leading 0 in address when winery rating is 0 or null', () => {
    const unratedWinery = {
      ...mockWinery,
      rating: 0,
      address: '123 Wine Trail, Geneva, NY',
    };
    render(<DesktopWineryModal {...defaultProps} winery={unratedWinery} />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('123 Wine Trail, Geneva, NY')).toBeInTheDocument();
  });
});
