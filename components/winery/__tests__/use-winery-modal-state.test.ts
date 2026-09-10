import { renderHook, act } from '@testing-library/react';
import { useWineryModalState } from '../use-winery-modal-state';
import { useUIStore } from '@/lib/stores/uiStore';
import { useVisitStore } from '@/lib/stores/visitStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { useMapStore } from '@/lib/stores/mapStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { createMockWinery, createMockVisitWithWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId } from '@/lib/types';

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-ai-features', () => ({
  useAIFeaturesEnabled: jest.fn(() => true),
}));

describe('useWineryModalState', () => {
  const mockWinery1 = createMockWinery({
    id: 'winery-1' as GooglePlaceId,
    name: 'Heron Hill Winery',
    userVisited: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useUIStore.setState({
      isWineryModalOpen: true,
      activeWineryId: 'winery-1',
    });
    useWineryStore.setState({
      persistentWineries: [mockWinery1],
      loadingWineryId: null,
    });
    useVisitStore.setState({
      visits: [
        createMockVisitWithWinery({ id: 'v1' as any, wineryId: 'winery-1' as GooglePlaceId, visit_date: '2025-01-01', user_review: 'First' }),
        createMockVisitWithWinery({ id: 'v2' as any, wineryId: 'winery-1' as GooglePlaceId, visit_date: '2025-06-01', user_review: 'Second' }),
      ],
    });
    useMapStore.setState({
      isStreetViewActive: false,
    });
    useTripStore.setState({
      trips: [],
    });
  });

  it('selects active winery and merges/sorts visits by date descending', () => {
    const { result } = renderHook(() => useWineryModalState());

    expect(result.current.activeWinery?.name).toBe('Heron Hill Winery');
    expect(result.current.visits).toHaveLength(2);
    // 2025-06-01 should come before 2025-01-01
    expect(result.current.visits[0].id).toBe('v2');
    expect(result.current.visits[1].id).toBe('v1');
  });

  it('updates activeTab and computes effectiveActiveTab', () => {
    const { result } = renderHook(() => useWineryModalState());

    expect(result.current.activeTab).toBe('community');
    expect(result.current.effectiveActiveTab).toBe('community');

    act(() => {
      result.current.setActiveTab('amenities');
    });

    expect(result.current.activeTab).toBe('amenities');
    expect(result.current.effectiveActiveTab).toBe('amenities');
  });

  it('manages lightbox photo state', () => {
    const { result } = renderHook(() => useWineryModalState());

    expect(result.current.lightboxPhoto).toBeNull();

    act(() => {
      result.current.setLightboxPhoto('photo-123');
    });

    expect(result.current.lightboxPhoto).toBe('photo-123');

    act(() => {
      result.current.setLightboxPhoto(null);
    });

    expect(result.current.lightboxPhoto).toBeNull();
  });

  it('closes modal and clears lightbox photo on closeWineryModal', () => {
    const { result } = renderHook(() => useWineryModalState());

    act(() => {
      result.current.setLightboxPhoto('photo-123');
    });

    act(() => {
      result.current.closeWineryModal();
    });

    expect(result.current.lightboxPhoto).toBeNull();
    expect(useUIStore.getState().isWineryModalOpen).toBe(false);
  });

  it('provides reactive 3-tier layout resolution (mobile, tablet, desktop)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    const { result, rerender } = renderHook(() => useWineryModalState());

    expect(result.current.tier).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 810 });
      window.dispatchEvent(new Event('resize'));
    });
    rerender();

    expect(result.current.tier).toBe('tablet');
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
      window.dispatchEvent(new Event('resize'));
    });
    rerender();

    expect(result.current.tier).toBe('desktop');
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(true);
  });
});
