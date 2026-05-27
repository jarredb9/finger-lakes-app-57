"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncService } from "@/lib/services/syncService";
import { useSyncStore } from "@/lib/stores/syncStore";
import { Button } from "./ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;
  const mounted = useMounted();
  const queueLength = useSyncStore(state => state.queue.length);

  if (!mounted || (!isOffline && queueLength === 0)) return null;

  return (
    <div
      className={cn(
        "fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-xs transition-all animate-in fade-in slide-in-from-top-4",
        isOffline ? "bg-yellow-500/80" : "bg-blue-500/80",
        "flex items-center gap-3"
      )}
      role="status"
      aria-live="polite"
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Offline: Map detail limited</span>
          {queueLength > 0 && (
            <span className="ml-2 bg-black/20 px-2 py-0.5 rounded-full text-xs">
              {queueLength} pending
            </span>
          )}
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Syncing {queueLength} items...</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 px-2 text-xs hover:bg-white/20 text-white"
            onClick={() => SyncService.sync()}
          >
            Retry Now
          </Button>
        </>
      )}
    </div>
  );
}
