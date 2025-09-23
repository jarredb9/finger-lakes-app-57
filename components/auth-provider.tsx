'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUserStore } from '@/lib/stores/userStore';

const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/manual-confirm'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchUser, isLoading } = useUserStore();
  const pathname = usePathname();

  useEffect(() => {
    if (!publicPaths.includes(pathname)) {
      fetchUser();
    }
  }, [fetchUser, pathname]);

  // While the user is being fetched on a protected route, we can show a loader
  // On public routes, we render children immediately.
  const isPublicPath = publicPaths.includes(pathname);
  if (!isPublicPath && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {/* You can replace this with a more sophisticated loading spinner */}
        <p>Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}