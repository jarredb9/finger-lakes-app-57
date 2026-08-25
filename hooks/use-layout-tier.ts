import * as React from 'react';

export const DEFAULT_TABLET_BREAKPOINT = 768;
export const DEFAULT_DESKTOP_BREAKPOINT = 1024;

export const LAYOUT_BREAKPOINTS = {
  TABLET: DEFAULT_TABLET_BREAKPOINT,
  DESKTOP: DEFAULT_DESKTOP_BREAKPOINT,
} as const;

export type LayoutTier = 'mobile' | 'tablet' | 'desktop';

export interface UseLayoutTierOptions {
  tabletBreakpoint?: number;
  desktopBreakpoint?: number;
}

export interface LayoutTierState {
  tier: LayoutTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
}

function resolveLayoutTier(
  width: number,
  tabletBreakpoint: number,
  desktopBreakpoint: number
): LayoutTier {
  if (width < tabletBreakpoint) return 'mobile';
  if (width < desktopBreakpoint) return 'tablet';
  return 'desktop';
}

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouchPoints =
    typeof navigator !== 'undefined' &&
    ((navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      ((navigator as any).msMaxTouchPoints && (navigator as any).msMaxTouchPoints > 0));
  const hasCoarsePointer = !!window.matchMedia?.('(pointer: coarse)')?.matches;
  return !!(hasTouchPoints || hasCoarsePointer);
}

/**
 * Reactive hook providing the current viewport tier (mobile, tablet, desktop)
 * and touch capability flags for responsive layout adaptation.
 */
export function useLayoutTier(options: UseLayoutTierOptions = {}): LayoutTierState {
  const tabletBreakpoint = options.tabletBreakpoint ?? DEFAULT_TABLET_BREAKPOINT;
  const desktopBreakpoint = options.desktopBreakpoint ?? DEFAULT_DESKTOP_BREAKPOINT;

  const [tier, setTier] = React.useState<LayoutTier>('desktop');
  const [isTouch, setIsTouch] = React.useState<boolean>(false);

  React.useEffect(() => {
    const handleResize = () => {
      setTier(resolveLayoutTier(window.innerWidth, tabletBreakpoint, desktopBreakpoint));
      setIsTouch(detectTouchCapability());
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [tabletBreakpoint, desktopBreakpoint]);

  return {
    tier,
    isMobile: tier === 'mobile',
    isTablet: tier === 'tablet',
    isDesktop: tier === 'desktop',
    isTouch,
  };
}
