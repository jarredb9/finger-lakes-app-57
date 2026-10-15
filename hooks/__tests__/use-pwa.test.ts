import { renderHook, act } from '@testing-library/react';
import { usePwa } from '../use-pwa';
import { usePWAUpdate } from '../use-pwa-update';

jest.mock('../use-pwa-update', () => ({
  usePWAUpdate: jest.fn(),
}));

// Return type signature of usePwa
export interface UsePwaReturn {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isUpdateAvailable: boolean;
  updateApp: () => void;
  isStandalone: boolean;
}

// Custom BeforeInstallPromptEvent shape for JSDOM dispatch
export interface MockBeforeInstallPromptEvent extends Event {
  prompt: jest.Mock<Promise<void>, []>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  preventDefault: jest.Mock<void, []>;
}

// Mock interface for usePWAUpdate dependency
export interface MockUsePwaUpdateReturn {
  isUpdateAvailable: boolean;
  applyUpdate: jest.Mock<void, []>;
}

function createMockBeforeInstallPromptEvent(
  outcome: 'accepted' | 'dismissed' = 'accepted'
): MockBeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as MockBeforeInstallPromptEvent;
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  event.preventDefault = jest.fn();
  return event;
}

describe('usePwa Hook', () => {
  let mockApplyUpdate: jest.Mock;
  const originalStandalone = (window.navigator as any).standalone;
  const originalReferrer = document.referrer;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApplyUpdate = jest.fn();
    (usePWAUpdate as jest.Mock).mockReturnValue({
      isUpdateAvailable: false,
      applyUpdate: mockApplyUpdate,
    });

    // Default: Browser mode (non-standalone)
    Object.defineProperty(window.navigator, 'standalone', {
      value: false,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
      writable: true,
    });

    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'standalone', {
      value: originalStandalone,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(document, 'referrer', {
      value: originalReferrer,
      configurable: true,
      writable: true,
    });

    window.matchMedia = originalMatchMedia;
  });

  describe('Standard Browser Mode (Non-Standalone)', () => {
    it('initializes with default non-standalone, non-installable state when no prompt fired', () => {
      const { result } = renderHook(() => usePwa());

      expect(result.current.isStandalone).toBe(false);
      expect(result.current.isInstallable).toBe(false);
      expect(result.current.isUpdateAvailable).toBe(false);
    });

    it('captures beforeinstallprompt event, prevents default, and sets isInstallable to true', () => {
      const { result } = renderHook(() => usePwa());
      const event = createMockBeforeInstallPromptEvent();

      act(() => {
        window.dispatchEvent(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result.current.isInstallable).toBe(true);
      expect(result.current.isStandalone).toBe(false);
    });

    it('completes app installation flow when user accepts prompt and clears isInstallable', async () => {
      const { result } = renderHook(() => usePwa());
      const event = createMockBeforeInstallPromptEvent('accepted');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.isInstallable).toBe(true);

      await act(async () => {
        await result.current.installApp();
      });

      expect(event.prompt).toHaveBeenCalledTimes(1);
      expect(result.current.isInstallable).toBe(false);
    });

    it('keeps isInstallable true if user dismisses install prompt', async () => {
      const { result } = renderHook(() => usePwa());
      const event = createMockBeforeInstallPromptEvent('dismissed');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.isInstallable).toBe(true);

      await act(async () => {
        await result.current.installApp();
      });

      expect(event.prompt).toHaveBeenCalledTimes(1);
      expect(result.current.isInstallable).toBe(true);
    });

    it('gracefully handles installApp invocation when no install prompt is present', async () => {
      const { result } = renderHook(() => usePwa());

      await expect(
        act(async () => {
          await result.current.installApp();
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Standalone Mode Signal Detection Matrix', () => {
    it('detects standalone mode via iOS WebClip signal (navigator.standalone = true)', () => {
      Object.defineProperty(window.navigator, 'standalone', {
        value: true,
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => usePwa());

      expect(result.current.isStandalone).toBe(true);
    });

    it('detects standalone mode via W3C standard media query (display-mode: standalone)', () => {
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      const { result } = renderHook(() => usePwa());

      expect(result.current.isStandalone).toBe(true);
    });

    it('detects standalone mode via Android app referrer (android-app://)', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'android-app://com.example.pwa',
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => usePwa());

      expect(result.current.isStandalone).toBe(true);
    });

    it('enforces strict boolean type casting for isStandalone when standalone signals are undefined or empty', () => {
      Object.defineProperty(window.navigator, 'standalone', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
        writable: true,
      });

      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      const { result } = renderHook(() => usePwa());

      expect(result.current.isStandalone).toStrictEqual(false);
    });
  });

  describe('Standalone Mode Installability Suppression Invariant (Red Phase)', () => {
    it('suppresses isInstallable when running in iOS WebClip standalone mode even if beforeinstallprompt fires', () => {
      Object.defineProperty(window.navigator, 'standalone', {
        value: true,
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => usePwa());
      const event = createMockBeforeInstallPromptEvent();

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.isStandalone).toBe(true);
      expect(result.current.isInstallable).toBe(false);
    });

    it('suppresses isInstallable when running in W3C matchMedia standalone mode even if beforeinstallprompt fires', () => {
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      const { result } = renderHook(() => usePwa());
      const event = createMockBeforeInstallPromptEvent();

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.isStandalone).toBe(true);
      expect(result.current.isInstallable).toBe(false);
    });

    it('suppresses isInstallable when running in Android referrer standalone mode even if beforeinstallprompt fires', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'android-app://com.example.pwa',
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => usePwa());
      const event = createMockBeforeInstallPromptEvent();

      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.isStandalone).toBe(true);
      expect(result.current.isInstallable).toBe(false);
    });
  });

  describe('PWA Update Integration Delegation', () => {
    it('delegates isUpdateAvailable and updateApp to usePWAUpdate', () => {
      (usePWAUpdate as jest.Mock).mockReturnValue({
        isUpdateAvailable: true,
        applyUpdate: mockApplyUpdate,
      });

      const { result } = renderHook(() => usePwa());

      expect(result.current.isUpdateAvailable).toBe(true);
      result.current.updateApp();
      expect(mockApplyUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
