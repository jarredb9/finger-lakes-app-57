import type { JSX, ReactNode } from 'react';
import type { TripStopWinery, NavigationProvider } from '@/lib/utils/trip-navigation';

export interface TripNavigationProps {
  stops: TripStopWinery[];
  tripTitle?: string;
  className?: string;
  trigger?: ReactNode;
  onLaunch?: (provider: NavigationProvider) => void;
}

export function TripNavigation(_props: TripNavigationProps): JSX.Element {
  throw new Error('Not implemented');
}

export default TripNavigation;
