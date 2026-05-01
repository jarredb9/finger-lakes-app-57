'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUserStore } from '@/lib/stores/userStore';
import { useFriendStore } from '@/lib/stores/friendStore';
import { useVisitStore } from '@/lib/stores/visitStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { SyncService } from '@/lib/services/syncService';

const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/manual-confirm', '/logout'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchUser, isLoading } = useUserStore();
  const { fetchFriends } = useFriendStore();
  const pathname = usePathname();

  useEffect(() => {
    const init = async () => {
      if (!publicPaths.includes(pathname)) {
        await fetchUser();
        await fetchFriends();
        // Hydrate pending offline items
        await useVisitStore.getState().initialize();
        await useTripStore.getState().initialize();
      }
    };
    init();
  }, [fetchUser, fetchFriends, pathname]);

  // Sync Service Trigger Logic
  // We trigger it here to ensure it runs across all pages after hydration,
  // but with a delay to avoid blocking initial redirection/rendering.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const triggerSync = () => {
      console.log('[AuthProvider] Triggering SyncService.sync()');
      SyncService.sync();
    };

    // Delay initial sync to prevent competition with hydration/redirection
    const timer = setTimeout(triggerSync, 1000);

    window.addEventListener('online', triggerSync);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', triggerSync);
    };
  }, []);

  const isPublicPath = publicPaths.includes(pathname);
  if (!isPublicPath && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" data-testid="auth-loading">
        <p>Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}