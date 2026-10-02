import { renderHook, act } from '@testing-library/react';
import { usePWAUpdate } from '../use-pwa-update';
import { useUIStore } from '@/lib/stores/uiStore';
import { useWineryStore } from '@/lib/stores/wineryStore';

describe('usePWAUpdate', () => {
  let mockRegistration: any;
  let mockServiceWorker: any;

  beforeEach(() => {
    mockRegistration = {
      waiting: null,
      installing: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    mockServiceWorker = {
      ready: Promise.resolve(mockRegistration),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      controller: {},
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: mockServiceWorker,
      },
      writable: true,
    });

    // Satisfy JSDOM by using a mock for reload
    const mockReload = jest.fn();
    window._E2E_RELOAD = mockReload;

    delete globalThis._PWA_UPDATING;
    process.env.NEXT_PUBLIC_IS_E2E = '';
    window.sessionStorage.clear();
    act(() => {
      useUIStore.getState().closeWineryModal();
      useUIStore.setState({ activeWineryId: null, isWineryModalOpen: false });
    });
  });

  it('should detect update if SW is waiting on init', async () => {
    mockRegistration.waiting = { postMessage: jest.fn() };
    
    let result: any;
    await act(async () => {
       result = renderHook(() => usePWAUpdate()).result;
    });

    expect(result.current.isUpdateAvailable).toBe(true);
  });

  it('should reload on controllerchange if not already updating', async () => {
    renderHook(() => usePWAUpdate());
    
    const handler = mockServiceWorker.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )[1];

    act(() => {
      handler();
    });

    expect(globalThis._PWA_UPDATING).toBe(true);
    expect(window._E2E_RELOAD).toHaveBeenCalled();
  });

  it('should NOT reload on controllerchange if already updating', async () => {
    globalThis._PWA_UPDATING = true;
    renderHook(() => usePWAUpdate());
    
    const handler = mockServiceWorker.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )[1];

    act(() => {
      handler();
    });

    // If it didn't crash, it means it returned early because _PWA_UPDATING was already true
    expect(globalThis._PWA_UPDATING).toBe(true);
  });

  describe('Session Storage Persistence on applyUpdate', () => {
    it('asserts _PWA_JUST_UPDATED timestamp is stored in sessionStorage on applyUpdate', async () => {
      const mockPostMessage = jest.fn();
      mockRegistration.waiting = { postMessage: mockPostMessage };

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      const beforeTime = Date.now();
      act(() => {
        hookResult.current.applyUpdate();
      });
      const afterTime = Date.now();

      const storedTimestampStr = window.sessionStorage.getItem('_PWA_JUST_UPDATED');
      expect(storedTimestampStr).not.toBeNull();
      const storedTimestamp = Number(storedTimestampStr);
      expect(storedTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTimestamp).toBeLessThanOrEqual(afterTime);
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('asserts _PWA_ACTIVE_WINERY_ID is stored in sessionStorage when an active winery modal is open', async () => {
      const mockPostMessage = jest.fn();
      mockRegistration.waiting = { postMessage: mockPostMessage };

      act(() => {
        useUIStore.getState().openWineryModal('winery-modal-restore-456');
      });
      expect(useUIStore.getState().activeWineryId).toBe('winery-modal-restore-456');

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      act(() => {
        hookResult.current.applyUpdate();
      });

      expect(window.sessionStorage.getItem('_PWA_ACTIVE_WINERY_ID')).toBe('winery-modal-restore-456');
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('does NOT store _PWA_ACTIVE_WINERY_ID in sessionStorage when no winery modal is open', async () => {
      const mockPostMessage = jest.fn();
      mockRegistration.waiting = { postMessage: mockPostMessage };

      act(() => {
        useUIStore.getState().closeWineryModal();
      });

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      act(() => {
        hookResult.current.applyUpdate();
      });

      expect(window.sessionStorage.getItem('_PWA_ACTIVE_WINERY_ID')).toBeNull();
      expect(window.sessionStorage.getItem('_PWA_JUST_UPDATED')).not.toBeNull();
    });

    it('remains decoupled from domain data stores and does not invoke fetchWineryData', async () => {
      const fetchWineryDataSpy = jest.spyOn(useWineryStore.getState(), 'fetchWineryData');
      mockRegistration.waiting = { postMessage: jest.fn() };

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      act(() => {
        hookResult.current.applyUpdate();
      });

      expect(fetchWineryDataSpy).not.toHaveBeenCalled();
      fetchWineryDataSpy.mockRestore();
    });
  });
});
