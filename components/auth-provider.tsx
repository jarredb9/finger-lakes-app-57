'use client';

import { useEffect } from 'react';
import { useUserStore } from '@/lib/stores/userStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchUser } = useUserStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return <>{children}</>;
}
