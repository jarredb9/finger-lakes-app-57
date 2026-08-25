import { renderHook, act } from '@testing-library/react';
import {
  useLayoutTier,
  DEFAULT_TABLET_BREAKPOINT,
  DEFAULT_DESKTOP_BREAKPOINT,
  LAYOUT_BREAKPOINTS,
} from '../use-layout-tier';

describe('useLayoutTier hook', () => {
  const originalInnerWidth = window.innerWidth;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  const setWindowWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  };

  const setTouchDevice = (isTouch: boolean) => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: isTouch ? 5 : 0,
    });
  };

  afterEach(() => {
    setWindowWidth(originalInnerWidth);
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: originalMaxTouchPoints,
    });
    jest.restoreAllMocks();
  });

  describe('Constants and exports', () => {
    it('should export expected default breakpoint constants', () => {
      expect(DEFAULT_TABLET_BREAKPOINT).toBe(768);
      expect(DEFAULT_DESKTOP_BREAKPOINT).toBe(1024);
      expect(LAYOUT_BREAKPOINTS).toEqual({
        TABLET: 768,
        DESKTOP: 1024,
      });
    });
  });

  describe('Breakpoint resolution with default thresholds', () => {
    it('should resolve mobile tier for widths below 768px (e.g. 375px)', () => {
      setWindowWidth(375);
      const { result } = renderHook(() => useLayoutTier());

      expect(result.current.tier).toBe('mobile');
      expect(result.current.isMobile).toBe(true);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(false);
    });

    it('should resolve tablet tier for widths between 768px and 1023px (e.g. 768px, 810px, 1023px)', () => {
      setWindowWidth(768);
      const { result: res1 } = renderHook(() => useLayoutTier());
      expect(res1.current.tier).toBe('tablet');
      expect(res1.current.isMobile).toBe(false);
      expect(res1.current.isTablet).toBe(true);
      expect(res1.current.isDesktop).toBe(false);

      setWindowWidth(810);
      const { result: res2 } = renderHook(() => useLayoutTier());
      expect(res2.current.tier).toBe('tablet');
      expect(res2.current.isTablet).toBe(true);

      setWindowWidth(1023);
      const { result: res3 } = renderHook(() => useLayoutTier());
      expect(res3.current.tier).toBe('tablet');
      expect(res3.current.isTablet).toBe(true);
    });

    it('should resolve desktop tier for widths at or above 1024px (e.g. 1024px, 1440px)', () => {
      setWindowWidth(1024);
      const { result: res1 } = renderHook(() => useLayoutTier());
      expect(res1.current.tier).toBe('desktop');
      expect(res1.current.isMobile).toBe(false);
      expect(res1.current.isTablet).toBe(false);
      expect(res1.current.isDesktop).toBe(true);

      setWindowWidth(1440);
      const { result: res2 } = renderHook(() => useLayoutTier());
      expect(res2.current.tier).toBe('desktop');
      expect(res2.current.isDesktop).toBe(true);
    });
  });

  describe('Custom breakpoint overrides', () => {
    it('should respect custom tablet and desktop breakpoints', () => {
      setWindowWidth(650);
      const { result } = renderHook(() =>
        useLayoutTier({ tabletBreakpoint: 600, desktopBreakpoint: 900 })
      );

      expect(result.current.tier).toBe('tablet');
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });

    it('should treat width below custom tabletBreakpoint as mobile', () => {
      setWindowWidth(550);
      const { result } = renderHook(() =>
        useLayoutTier({ tabletBreakpoint: 600, desktopBreakpoint: 900 })
      );

      expect(result.current.tier).toBe('mobile');
      expect(result.current.isMobile).toBe(true);
    });

    it('should treat width at or above custom desktopBreakpoint as desktop', () => {
      setWindowWidth(900);
      const { result } = renderHook(() =>
        useLayoutTier({ tabletBreakpoint: 600, desktopBreakpoint: 900 })
      );

      expect(result.current.tier).toBe('desktop');
      expect(result.current.isDesktop).toBe(true);
    });
  });

  describe('Reactive window resize listener', () => {
    it('should dynamically update layout tier on resize event', () => {
      setWindowWidth(375);
      const { result } = renderHook(() => useLayoutTier());
      expect(result.current.tier).toBe('mobile');

      act(() => {
        setWindowWidth(810);
        window.dispatchEvent(new Event('resize'));
      });

      expect(result.current.tier).toBe('tablet');
      expect(result.current.isTablet).toBe(true);

      act(() => {
        setWindowWidth(1280);
        window.dispatchEvent(new Event('resize'));
      });

      expect(result.current.tier).toBe('desktop');
      expect(result.current.isDesktop).toBe(true);
    });

    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useLayoutTier());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('Touch capability flag', () => {
    it('should detect touch capability when maxTouchPoints > 0', () => {
      setTouchDevice(true);
      const { result } = renderHook(() => useLayoutTier());
      expect(result.current.isTouch).toBe(true);
    });

    it('should return false for isTouch when no touch capability is present', () => {
      setTouchDevice(false);
      const { result } = renderHook(() => useLayoutTier());
      expect(result.current.isTouch).toBe(false);
    });
  });
});
