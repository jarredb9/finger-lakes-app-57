'use client';

import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import {
  type TripStopWinery,
  type NavigationProvider,
  launchTripNavigation,
} from '@/lib/utils/trip-navigation';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';

export interface TripNavigationProps {
  stops: TripStopWinery[];
  tripTitle?: string;
  className?: string;
  trigger?: ReactNode;
  onLaunch?: (provider: NavigationProvider) => void;
}

export function TripNavigation({
  stops,
  tripTitle,
  className,
  trigger,
  onLaunch,
}: TripNavigationProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const isDisabled = !stops || stops.length === 0;

  const handleProviderSelect = (provider: NavigationProvider) => {
    launchTripNavigation(provider, stops, {});
    onLaunch?.(provider);
    setIsOpen(false);
  };

  return (
    <div className={className}>
      {trigger ? (
        <span onClick={() => !isDisabled && setIsOpen(true)}>{trigger}</span>
      ) : (
        <Button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={isDisabled}
          className="gap-2"
        >
          <Navigation className="h-4 w-4" />
          Navigate Trip
        </Button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-background text-foreground rounded-lg p-6 max-w-sm w-full space-y-4 shadow-xl border">
            <div>
              <h3 className="text-lg font-semibold">Choose Navigation Provider</h3>
              <p className="text-sm text-muted-foreground">
                Select your preferred maps app to start Trip Navigation
                {tripTitle ? ` for ${tripTitle}` : ''}.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleProviderSelect('apple')}
              >
                Apple Maps
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleProviderSelect('google')}
              >
                Google Maps
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleProviderSelect('waze')}
              >
                Waze
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TripNavigation;
