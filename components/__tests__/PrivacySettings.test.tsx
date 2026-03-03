import { render, screen } from '@testing-library/react';
import PrivacySettings from '../PrivacySettings';

// Mock UserStore
let mockUser: any = { id: '1', name: 'Test', email: 'test@ex.com', privacy_level: 'public' };
jest.mock('@/lib/stores/userStore', () => ({
  useUserStore: () => ({
    user: mockUser,
    updatePrivacyLevel: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
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

describe('PrivacySettings Component', () => {
  it('renders privacy settings card', () => {
    render(<PrivacySettings />);
    expect(screen.getByTestId('privacy-settings-card')).toBeInTheDocument();
    expect(screen.getByText('Privacy Settings')).toBeInTheDocument();
  });

  it('shows correct description for public privacy', () => {
    mockUser.privacy_level = 'public';
    render(<PrivacySettings />);
    expect(screen.getByText('Anyone can find and view your profile.')).toBeInTheDocument();
  });

  it('shows correct description for friends_only privacy', () => {
    mockUser.privacy_level = 'friends_only';
    render(<PrivacySettings />);
    expect(screen.getByText('Only your friends can see your full history.')).toBeInTheDocument();
  });

  it('shows correct description for private privacy', () => {
    mockUser.privacy_level = 'private';
    render(<PrivacySettings />);
    expect(screen.getByText('Your history is hidden from everyone.')).toBeInTheDocument();
  });
});
