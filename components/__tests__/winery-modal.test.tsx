import { render, screen, within } from '@testing-library/react';
import WineryModal from '../winery-modal';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { useUIStore } from '@/lib/stores/uiStore';
import { useWineryDataStore } from '@/lib/stores/wineryDataStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { useVisitStore } from '@/lib/stores/visitStore';
import { useFriendStore } from '@/lib/stores/friendStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { useMapStore } from '@/lib/stores/mapStore';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

// Mock the toast hook
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock the sub-components that are not the focus of this test
jest.mock('../WineryDetails', () => {
  return function DummyWineryDetails() {
    return <div data-testid="winery-details">WineryDetails</div>;
  };
});

jest.mock('../TripPlannerSection', () => {
  return function DummyTripPlanner() {
    return <div data-testid="trip-planner-section">TripPlanner</div>;
  };
});

jest.mock('../WineryQnA', () => {
  return function DummyQnA() {
    return <div data-testid="winery-qna">QnA</div>;
  };
});

const TEST_WINERY_ID = 'ch-test-modal-winery' as GooglePlaceId;
const mockWinery = createMockWinery({
  id: TEST_WINERY_ID,
  dbId: 42 as WineryDbId,
  name: 'Test Modal Winery',
  isFavorite: true,
  favoriteIsPrivate: false,
  onWishlist: true,
  wishlistIsPrivate: true,
});

function setupStores() {
  useUIStore.setState({
    isWineryModalOpen: true,
    activeWineryId: TEST_WINERY_ID,
  });
  useWineryDataStore.setState({
    persistentWineries: [mockWinery],
  });
  useWineryStore.setState({
    loadingWineryId: null,
  });
  useVisitStore.setState({
    visits: [],
  });
  useFriendStore.setState({
    friendsRatings: [
      {
        user_id: 'friend-1',
        name: 'Alice',
        rating: 4,
        user_review: 'Great Riesling selection!',
        photos: ['photo1.jpg', 'photo2.jpg'],
      },
    ],
    friendsActivity: {
      favoritedBy: [{ id: 'friend-1', name: 'Alice', email: 'alice@test.com' }],
      wishlistedBy: [],
    },
  });
  useTripStore.setState({
    trips: [],
  });
  useMapStore.setState({
    isStreetViewActive: false,
    map: null,
  });
}

describe('WineryModal Redesign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStores();
  });

  describe('Responsive Rendering', () => {
    it('renders a Drawer component on mobile viewports (< sm)', () => {
      // Mock window.matchMedia for mobile viewport
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
      window.dispatchEvent(new Event('resize'));

      render(<WineryModal />);

      // The redesigned modal should use a Drawer (Vaul) on mobile, which renders
      // with a data-vaul-drawer attribute or specific drawer test IDs
      const drawer = screen.queryByTestId('winery-modal-drawer');
      expect(drawer).toBeInTheDocument();
    });

    it('renders a Dialog component on desktop viewports (>= sm)', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      window.dispatchEvent(new Event('resize'));

      render(<WineryModal />);

      // The redesigned modal should use a Dialog on desktop
      const dialog = screen.queryByTestId('winery-modal-dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('WineryCommunityTab consolidation', () => {
    it('renders a consolidated WineryCommunityTab merging friend avatars and review details', () => {
      render(<WineryModal />);

      // After the redesign, FriendActivity and FriendRatings should be merged
      // into a single WineryCommunityTab rendered under the "Community" tab
      const communityTab = screen.getByTestId('community-tab');
      expect(communityTab).toBeInTheDocument();

      // Should contain friend avatar summaries
      const avatarSummary = within(communityTab).getByText('Alice');
      expect(avatarSummary).toBeInTheDocument();

      // Should contain detailed friend review text
      expect(within(communityTab).getByText('Great Riesling selection!')).toBeInTheDocument();

      // Should contain uploaded photos from friend reviews
      const photos = within(communityTab).getAllByRole('img');
      expect(photos.length).toBeGreaterThan(0);
    });
  });

  describe('Quick Action buttons', () => {
    it('contains a Share button in the quick actions row', () => {
      render(<WineryModal />);

      // The redesigned modal should have a Share button
      const shareButton = screen.getByTestId('share-button');
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).toHaveTextContent(/share/i);
    });

    it('retains individual privacy locks with correct test IDs', () => {
      render(<WineryModal />);

      // Privacy toggles must remain with exact test IDs for E2E compatibility
      const favPrivacyToggle = screen.getByTestId('favorite-privacy-toggle');
      expect(favPrivacyToggle).toBeInTheDocument();

      const wishPrivacyToggle = screen.getByTestId('wishlist-privacy-toggle');
      expect(wishPrivacyToggle).toBeInTheDocument();
    });
  });
});
