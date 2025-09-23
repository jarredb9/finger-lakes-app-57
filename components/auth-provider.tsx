'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUserStore } from '@/lib/stores/userStore';

const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/manual-confirm'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchUser, isLoading } = useUserStore();
  const pathname = usePathname();

  useEffect(() => {
    console.log("AuthProvider pathname:", pathname);
    const isPublic = publicPaths.includes(pathname);
    console.log("Is public path?", isPublic);

    if (!isPublic) {
      console.log("This is a protected path, calling fetchUser.");
      fetchUser();
    } else {
      console.log("This is a public path, skipping fetchUser.");
    }
  }, [fetchUser, pathname]);

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
