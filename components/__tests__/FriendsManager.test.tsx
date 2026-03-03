import { render, screen } from '@testing-library/react';
import FriendsManager from '../friends-manager';

// Mock dependencies
jest.mock('@/lib/stores/friendStore', () => ({
  useFriendStore: () => ({
    friends: [],
    friendRequests: [],
    sentRequests: [],
    friendActivityFeed: [],
    fetchFriends: jest.fn(),
    fetchFriendActivityFeed: jest.fn(),
    subscribeToSocialUpdates: jest.fn(),
    unsubscribeFromSocialUpdates: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock FriendActivityFeed to avoid its internal logic
jest.mock('@/components/FriendActivityFeed', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-activity-feed">Activity Feed</div>,
}));

describe('FriendsManager Component', () => {
  it('renders add friend card', () => {
    render(<FriendsManager />);
    expect(screen.getByTestId('add-friend-card')).toBeInTheDocument();
    expect(screen.getByText('Add a Friend')).toBeInTheDocument();
  });

  it('renders my friends card', () => {
    render(<FriendsManager />);
    expect(screen.getByTestId('my-friends-card')).toBeInTheDocument();
    expect(screen.getByText('My Friends')).toBeInTheDocument();
  });

  it('renders activity feed', () => {
    render(<FriendsManager />);
    expect(screen.getByTestId('mock-activity-feed')).toBeInTheDocument();
  });
});
