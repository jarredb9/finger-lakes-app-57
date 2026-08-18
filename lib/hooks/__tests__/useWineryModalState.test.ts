import { renderHook, act } from '@testing-library/react';
import { useWineryModalState } from '../useWineryModalState';
import { useUIStore } from '@/lib/stores/uiStore';
import { useWineryDataStore } from '@/lib/stores/wineryDataStore';
import { useVisitStore } from '@/lib/stores/visitStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { useMapStore } from '@/lib/stores/mapStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { createMockWinery, createMockVisit, createMockVisitWithWinery } from '@/lib/test-utils/fixtures';
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
    visits: [
      createMockVisit({ id: 'v1', visit_date: '2025-01-01', user_review: 'First' }),
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useUIStore.setState({
      isWineryModalOpen: true,
      activeWineryId: 'winery-1',
    });
    useWineryDataStore.setState({
      persistentWineries: [mockWinery1],
    });
    useVisitStore.setState({
      visits: [
        createMockVisitWithWinery({ id: 'v2', wineryId: 'winery-1' as GooglePlaceId, visit_date: '2025-06-01', user_review: 'Second' }),
      ],
    });
    useWineryStore.setState({
      loadingWineryId: null,
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
});
