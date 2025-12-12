'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUserStore } from '@/lib/stores/userStore';
import { useFriendStore } from '@/lib/stores/friendStore';

const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/manual-confirm', '/logout'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchUser, isLoading } = useUserStore();
  const { fetchFriends } = useFriendStore();
  const pathname = usePathname();

  useEffect(() => {
    if (!publicPaths.includes(pathname)) {
      fetchUser();
      fetchFriends();
    }
  }, [fetchUser, fetchFriends, pathname]);

  const isPublicPath = publicPaths.includes(pathname);
  if (!isPublicPath && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}