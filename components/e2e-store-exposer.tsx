"use client";

import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useSyncStore } from "@/lib/stores/syncStore";
import { SyncService } from "@/lib/services/syncService";
import { createClient } from "@/utils/supabase/client";
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { useEffect } from "react";

export function E2EStoreExposer() {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true') {
      window.useWineryDataStore = useWineryStore;
      window.useWineryStore = useWineryStore;
      window.useUIStore = useUIStore;
      window.useVisitStore = useVisitStore;
      window.useTripStore = useTripStore;
      window.useUserStore = useUserStore;
      window.useFriendStore = useFriendStore;
      window.useMapStore = useMapStore;
      window.useSyncStore = useSyncStore;
      window.SyncService = SyncService;
      window.createSupabaseClient = createClient;
      if (!window.supabase) {
        window.supabase = createClient();
      }
      window.idbKeyVal = { get: idbGet, set: idbSet };
      
      window._STORES_EXPOSED = true;

      // eslint-disable-next-line no-console
      console.log('[E2EStoreExposer] Stores, Supabase client, and SyncService exposed to window.');
    }
  }, []);

  if (typeof window === 'undefined') return null;

  return null;
}
