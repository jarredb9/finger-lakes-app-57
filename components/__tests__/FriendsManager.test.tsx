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

// Simple mock for Select to avoid Radix complexity in unit tests
jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

// Mock UserStore
let mockUser: any = { id: '1', name: 'Test', email: 'test@ex.com', privacy_level: 'public' };
jest.mock('@/lib/stores/userStore', () => ({
  useUserStore: () => ({
    user: mockUser,
    updatePrivacyLevel: jest.fn(),
  }),
}));

describe('FriendsManager Privacy UI', () => {
  it('renders privacy settings section', () => {
    render(<FriendsManager />);
    expect(screen.getByTestId('privacy-settings-card')).toBeInTheDocument();
    expect(screen.getByText('Privacy Settings')).toBeInTheDocument();
  });

  it('shows correct description for public privacy', () => {
    mockUser.privacy_level = 'public';
    render(<FriendsManager />);
    expect(screen.getByText('Anyone can find and view your profile.')).toBeInTheDocument();
  });

  it('shows correct description for friends_only privacy', () => {
    mockUser.privacy_level = 'friends_only';
    render(<FriendsManager />);
    expect(screen.getByText('Only your friends can see your full history.')).toBeInTheDocument();
  });

  it('shows correct description for private privacy', () => {
    mockUser.privacy_level = 'private';
    render(<FriendsManager />);
    expect(screen.getByText('Your history is hidden from everyone.')).toBeInTheDocument();
  });
});
