import { render, act } from '@testing-library/react';
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

describe('PwaHandler Component Quota Warning', () => {
  const mockToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (usePwa as jest.Mock).mockReturnValue({
      isInstallable: false,
      installApp: jest.fn(),
      isUpdateAvailable: false,
      updateApp: jest.fn(),
    });
    (useToast as jest.Mock).mockReturnValue({
      toast: mockToast,
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
