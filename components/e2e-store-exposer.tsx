"use client";

import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useSyncStore } from "@/lib/stores/syncStore";
import { SyncService } from "@/lib/services/syncService";
import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export function E2EStoreExposer() {
  useEffect(() => {
    // Expose stores in development or E2E mode
    if (typeof window !== 'undefined') {
      const isDev = process.env.NODE_ENV === 'development';
      const isE2E = process.env.NEXT_PUBLIC_IS_E2E === 'true';

      if (isDev || isE2E) {
        (window as any).useWineryDataStore = useWineryDataStore;
        (window as any).useWineryStore = useWineryStore;
        (window as any).useUIStore = useUIStore;
        (window as any).useVisitStore = useVisitStore;
        (window as any).useTripStore = useTripStore;
        (window as any).useUserStore = useUserStore;
        (window as any).useFriendStore = useFriendStore;
        (window as any).useMapStore = useMapStore;
        (window as any).useSyncStore = useSyncStore;
        (window as any).SyncService = SyncService;
        (window as any).supabase = createClient();
        // eslint-disable-next-line no-console
        console.log('[E2EStoreExposer] Stores, SyncService and Supabase client exposed to window.');
      }
    }
  }, []);

  if (typeof window === 'undefined') return null;

  return null;
}
