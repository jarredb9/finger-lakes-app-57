"use client";

import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useEffect } from "react";

export function E2EStoreExposer() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).useWineryDataStore = useWineryDataStore;
      (window as any).useUIStore = useUIStore;
      (window as any).useVisitStore = useVisitStore;
    }
  }, []);

  return null;
}
