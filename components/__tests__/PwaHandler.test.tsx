import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { PwaHandler } from '../pwa-handler';
import { usePwa } from '@/hooks/use-pwa';
import { useToast } from '@/hooks/use-toast';

// Mock hook dependencies
jest.mock('@/hooks/use-pwa', () => ({
  usePwa: jest.fn(),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(),
}));

const mockedUsePwa = usePwa as jest.MockedFunction<typeof usePwa>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;

describe('PwaHandler Component Quota Warning', () => {
  const mockToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePwa.mockReturnValue({
      isInstallable: false,
      isStandalone: false,
      installApp: jest.fn(),
      isUpdateAvailable: false,
      updateApp: jest.fn(),
    });
    mockedUseToast.mockReturnValue({
      toast: mockToast,
      toasts: [],
      dismiss: jest.fn(),
    });
  });

  it('listens for quota-exceeded-warning event and triggers toast warning', () => {
    render(<PwaHandler />);

    // Trigger the warning custom event
    act(() => {
      window.dispatchEvent(new CustomEvent('quota-exceeded-warning'));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Storage Limit Exceeded',
        description: 'Device storage is full. Offline changes cannot be saved.',
      })
    );
  });
});

describe('PwaHandler Component Install UI and Standalone Suppression', () => {
  const mockInstallApp = jest.fn();
  const mockUpdateApp = jest.fn();
  const mockToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseToast.mockReturnValue({
      toast: mockToast,
      toasts: [],
      dismiss: jest.fn(),
    });
  });

  describe('Standard Browser Mode (Non-Standalone)', () => {
    it('renders mobile top bar and desktop card when isInstallable is true and isStandalone is false', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: true,
        isStandalone: false,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      render(<PwaHandler />);

      expect(screen.getByTestId('mobile-pwa-install-bar')).toBeInTheDocument();
      expect(screen.getByTestId('desktop-pwa-install-card')).toBeInTheDocument();
      expect(screen.getByText('Install App')).toBeInTheDocument();
      expect(screen.getByText('Install Winery App')).toBeInTheDocument();
    });

    it('triggers installApp when mobile install button is clicked', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: true,
        isStandalone: false,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      render(<PwaHandler />);

      const mobileInstallButton = screen.getByRole('button', { name: /^install$/i });
      fireEvent.click(mobileInstallButton);

      expect(mockInstallApp).toHaveBeenCalledTimes(1);
    });

    it('triggers installApp when desktop install now button is clicked', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: true,
        isStandalone: false,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      render(<PwaHandler />);

      const desktopInstallButton = screen.getByRole('button', { name: /install now/i });
      fireEvent.click(desktopInstallButton);

      expect(mockInstallApp).toHaveBeenCalledTimes(1);
    });

    it('dismisses install bar and card when mobile dismiss button is clicked', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: true,
        isStandalone: false,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      render(<PwaHandler />);

      const mobileBar = screen.getByTestId('mobile-pwa-install-bar');
      const mobileDismissBtn = within(mobileBar).getByRole('button', { name: /dismiss/i });
      fireEvent.click(mobileDismissBtn);

      expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument();
    });

    it('dismisses install bar and card when desktop close button is clicked', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: true,
        isStandalone: false,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      render(<PwaHandler />);

      const desktopCard = screen.getByTestId('desktop-pwa-install-card');
      const desktopCloseBtn = within(desktopCard).getByRole('button', { name: /dismiss/i });
      fireEvent.click(desktopCloseBtn);

      expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument();
    });

    it('renders null when isInstallable is false and isStandalone is false', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: false,
        isStandalone: false,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      const { container } = render(<PwaHandler />);

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument();
    });
  });

  describe('Standalone Mode Suppression Invariant', () => {
    it('suppresses install banner and card when isStandalone is true and isInstallable is false', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: false,
        isStandalone: true,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      const { container } = render(<PwaHandler />);

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument();
    });

    it('suppresses install banner and card when isStandalone is true even if isInstallable is true', () => {
      mockedUsePwa.mockReturnValue({
        isInstallable: true,
        isStandalone: true,
        installApp: mockInstallApp,
        isUpdateAvailable: false,
        updateApp: mockUpdateApp,
      });

      const { container } = render(<PwaHandler />);

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument();
    });
  });
});

