import { render, screen, fireEvent } from '@testing-library/react';
import { UserNav } from '../user-nav';
import { AuthenticatedUser } from '@/lib/types';
import { usePwa } from '@/hooks/use-pwa';
import { useToast } from '@/hooks/use-toast';

jest.mock('@/hooks/use-pwa', () => ({
  usePwa: jest.fn(),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(),
}));

const mockUser: AuthenticatedUser = {
  id: 'user-456',
  email: 'sommelier@fingerlakes.com',
  name: 'Seneca Sommelier',
};

const mockedUsePwa = usePwa as jest.MockedFunction<typeof usePwa>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;

describe('UserNav Component', () => {
  const mockToast = jest.fn();
  const mockInstallApp = jest.fn();
  const mockUpdateApp = jest.fn();

  const openDropdown = (trigger: HTMLElement) => {
    fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseToast.mockReturnValue({
      toast: mockToast,
      toasts: [],
      dismiss: jest.fn(),
    });
    mockedUsePwa.mockReturnValue({
      isInstallable: false,
      isStandalone: false,
      installApp: mockInstallApp,
      isUpdateAvailable: false,
      updateApp: mockUpdateApp,
    });
  });

  it('renders default user avatar trigger and opens dropdown menu on click', () => {
    render(<UserNav user={mockUser} />);

    const trigger = screen.getByRole('button', { name: /user menu|user profile/i });
    expect(trigger).toBeInTheDocument();

    openDropdown(trigger);

    expect(screen.getByText('Seneca Sommelier')).toBeInTheDocument();
    expect(screen.getByText('sommelier@fingerlakes.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /terms of service/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  it('renders custom trigger if provided via prop', () => {
    render(
      <UserNav
        user={mockUser}
        trigger={
          <button data-testid="custom-avatar-trigger" aria-label="Custom avatar">
            Custom Avatar
          </button>
        }
      />
    );

    const customTrigger = screen.getByTestId('custom-avatar-trigger');
    expect(customTrigger).toBeInTheDocument();

    openDropdown(customTrigger);
    expect(screen.getByText('Seneca Sommelier')).toBeInTheDocument();
  });

  it('handles PWA install trigger when app is installable', () => {
    mockedUsePwa.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      installApp: mockInstallApp,
      isUpdateAvailable: false,
      updateApp: mockUpdateApp,
    });

    render(<UserNav user={mockUser} />);
    const trigger = screen.getByRole('button', { name: /user menu|user profile/i });
    openDropdown(trigger);

    const installItem = screen.getByRole('menuitem', { name: /install app/i });
    expect(installItem).toBeInTheDocument();

    fireEvent.click(installItem);
    expect(mockInstallApp).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows toast instructions when Add to Home Screen is clicked on non-installable browser', () => {
    mockedUsePwa.mockReturnValue({
      isInstallable: false,
      isStandalone: false,
      installApp: mockInstallApp,
      isUpdateAvailable: false,
      updateApp: mockUpdateApp,
    });

    render(<UserNav user={mockUser} />);
    const trigger = screen.getByRole('button', { name: /user menu|user profile/i });
    openDropdown(trigger);

    const addToHomeScreenItem = screen.getByRole('menuitem', { name: /add to home screen/i });
    expect(addToHomeScreenItem).toBeInTheDocument();

    fireEvent.click(addToHomeScreenItem);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Install Instructions',
      })
    );
  });

  it('shows Update Available item and triggers updateApp on click', () => {
    mockedUsePwa.mockReturnValue({
      isInstallable: false,
      isStandalone: true,
      installApp: mockInstallApp,
      isUpdateAvailable: true,
      updateApp: mockUpdateApp,
    });

    render(<UserNav user={mockUser} />);
    const trigger = screen.getByRole('button', { name: /user menu|user profile/i });
    openDropdown(trigger);

    const updateItem = screen.getByRole('menuitem', { name: /update available/i });
    expect(updateItem).toBeInTheDocument();

    fireEvent.click(updateItem);
    expect(mockUpdateApp).toHaveBeenCalledTimes(1);
  });
});
