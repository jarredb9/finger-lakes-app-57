import { Winery } from '@/lib/types';

export type NavigationProvider = 'google' | 'apple' | 'waze';

export interface NavigationProviderOption {
  id: NavigationProvider;
  label: string;
}

export const NAVIGATION_PROVIDERS: NavigationProviderOption[] = [];

export function formatWineryDestination(_winery: Winery): string {
  throw new Error('Not implemented');
}

export function generateTripNavigationUrl(
  _provider: NavigationProvider,
  _wineries: Winery[]
): string {
  throw new Error('Not implemented');
}
