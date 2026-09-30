import { render, screen, fireEvent } from '@testing-library/react';
import { WineryActionsPresentational } from '../WineryActionsPresentational';
import { createMockWinery } from '@/lib/test-utils/fixtures';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('WineryActionsPresentational', () => {
  const defaultWinery = createMockWinery({
    name: 'Seneca Tasting Room',
    address: '100 Lake Rd',
    rating: 4.7,
    userVisited: false,
    onWishlist: false,
    isFavorite: false,
  });

  const defaultProps = {
    winery: defaultWinery,
    onLogVisit: jest.fn(),
    onStreetView: jest.fn(),
    onToggleWishlist: jest.fn(),
    onToggleFavorite: jest.fn(),
    onToggleFavoritePrivacy: jest.fn(),
    onToggleWishlistPrivacy: jest.fn(),
    showLogVisit: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all action buttons properly for an unvisited winery', () => {
    render(<WineryActionsPresentational {...defaultProps} />);

    expect(screen.getByTestId('favorite-button')).toBeInTheDocument();
    const wishlistBtn = screen.getByTestId('wishlist-button');
    expect(wishlistBtn).toBeInTheDocument();
    expect(wishlistBtn).toBeEnabled();
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
    expect(screen.getByTestId('street-view-button')).toBeInTheDocument();
    expect(screen.getByTestId('share-button')).toBeInTheDocument();
    expect(screen.getByTestId('log-visit-button')).toBeInTheDocument();

    fireEvent.click(wishlistBtn);
    expect(defaultProps.onToggleWishlist).toHaveBeenCalledTimes(1);
  });

  it('allows wishlisting on an already visited winery (return-visit planning)', () => {
    const visitedWinery = {
      ...defaultWinery,
      userVisited: true,
      onWishlist: false,
    };

    render(<WineryActionsPresentational {...defaultProps} winery={visitedWinery} />);

    const wishlistBtn = screen.getByTestId('wishlist-button');
    expect(wishlistBtn).toBeInTheDocument();
    expect(wishlistBtn).toBeEnabled();
    expect(wishlistBtn).not.toHaveClass('opacity-50');
    expect(wishlistBtn).not.toHaveClass('cursor-not-allowed');

    fireEvent.click(wishlistBtn);
    expect(defaultProps.onToggleWishlist).toHaveBeenCalledTimes(1);
  });

  it('renders active wishlist state and privacy controls when winery is both visited and on wishlist', () => {
    const visitedAndWishlisted = {
      ...defaultWinery,
      userVisited: true,
      onWishlist: true,
      wishlistIsPrivate: false,
    };

    render(<WineryActionsPresentational {...defaultProps} winery={visitedAndWishlisted} />);

    const wishlistBtn = screen.getByTestId('wishlist-button');
    expect(wishlistBtn).toBeInTheDocument();
    expect(wishlistBtn).toBeEnabled();
    expect(wishlistBtn).not.toHaveClass('opacity-50');
    expect(wishlistBtn).not.toHaveClass('cursor-not-allowed');
    expect(screen.getByText('On List')).toBeInTheDocument();

    const privacyBtn = screen.getByTestId('wishlist-privacy-toggle');
    expect(privacyBtn).toBeInTheDocument();
    expect(privacyBtn).toHaveAttribute('aria-label', 'Make wishlist item private');

    fireEvent.click(privacyBtn);
    expect(defaultProps.onToggleWishlistPrivacy).toHaveBeenCalledTimes(1);
  });

  it('renders private wishlist state with correct label when wishlistIsPrivate is true', () => {
    const privateWishlistWinery = {
      ...defaultWinery,
      userVisited: true,
      onWishlist: true,
      wishlistIsPrivate: true,
    };

    render(<WineryActionsPresentational {...defaultProps} winery={privateWishlistWinery} />);

    const privacyBtn = screen.getByTestId('wishlist-privacy-toggle');
    expect(privacyBtn).toBeInTheDocument();
    expect(privacyBtn).toHaveAttribute('aria-label', 'Make wishlist item public');
  });

  it('calls onToggleFavorite and displays privacy toggle when favorite is active', () => {
    const favoriteWinery = {
      ...defaultWinery,
      isFavorite: true,
      favoriteIsPrivate: false,
    };

    render(<WineryActionsPresentational {...defaultProps} winery={favoriteWinery} />);

    const favoriteBtn = screen.getByTestId('favorite-button');
    fireEvent.click(favoriteBtn);
    expect(defaultProps.onToggleFavorite).toHaveBeenCalledTimes(1);

    const favPrivacyBtn = screen.getByTestId('favorite-privacy-toggle');
    expect(favPrivacyBtn).toBeInTheDocument();
    expect(favPrivacyBtn).toHaveAttribute('aria-label', 'Make favorite private');

    fireEvent.click(favPrivacyBtn);
    expect(defaultProps.onToggleFavoritePrivacy).toHaveBeenCalledTimes(1);
  });

  it('calls onStreetView when Street View button is clicked', () => {
    render(<WineryActionsPresentational {...defaultProps} />);

    fireEvent.click(screen.getByTestId('street-view-button'));
    expect(defaultProps.onStreetView).toHaveBeenCalledTimes(1);
  });

  it('calls onLogVisit when Log Visit button is clicked', () => {
    render(<WineryActionsPresentational {...defaultProps} />);

    fireEvent.click(screen.getByTestId('log-visit-button'));
    expect(defaultProps.onLogVisit).toHaveBeenCalledTimes(1);
  });

  it('hides Log Visit button when showLogVisit is false', () => {
    render(<WineryActionsPresentational {...defaultProps} showLogVisit={false} />);

    expect(screen.queryByTestId('log-visit-button')).not.toBeInTheDocument();
  });
});
