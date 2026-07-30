import { renderHook } from '@testing-library/react';
import { useAIFeaturesEnabled } from '../use-ai-features';
import { useUserStore } from '@/lib/stores/userStore';

describe('useAIFeaturesEnabled', () => {
  beforeEach(() => {
    useUserStore.setState({ user: null });
  });

  it('should return false by default when user is null or ai_enabled is false', () => {
    const { result, rerender } = renderHook(() => useAIFeaturesEnabled());
    expect(result.current).toBe(false);

    useUserStore.setState({ user: { id: 'u1', ai_enabled: false } });
    rerender();
    expect(result.current).toBe(false);
  });

  it('should return true when user.ai_enabled is true', () => {
    useUserStore.setState({ user: { id: 'u1', ai_enabled: true } });
    const { result } = renderHook(() => useAIFeaturesEnabled());
    expect(result.current).toBe(true);
  });
});
