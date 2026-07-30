import { useUserStore } from '@/lib/stores/userStore';

/**
 * Custom hook to determine if AI features (insights, recommendations, etc.)
 * are enabled by the user. Default is OFF (false).
 */
export function useAIFeaturesEnabled(): boolean {
  return useUserStore((state) => state.user?.ai_enabled ?? false);
}
