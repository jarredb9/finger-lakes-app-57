"use client";

import GlobalVisitHistory from "@/components/global-visit-history";
import { Button } from "@/components/ui/button";
import { List } from "lucide-react";
import { useUIStore } from "@/lib/stores/uiStore";

export interface HistoryTabContentProps {
  isActive?: boolean;
}

export function HistoryTabContent({ isActive = true }: HistoryTabContentProps) {
  const { setVisitHistoryModalOpen, isHydrated } = useUIStore();

  return (
    <div data-testid="history-tab-content" className="flex flex-col flex-1 overflow-y-auto">
      <div className="p-4 flex items-center justify-between shrink-0">
        <h3 className="text-lg font-semibold">My Visit History</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisitHistoryModalOpen(true)}
          className="gap-2 shrink-0"
          disabled={!isHydrated}
        >
          <List className="w-4 h-4" />
          View as Table
        </Button>
      </div>
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        <GlobalVisitHistory isActive={isActive} />
      </div>
    </div>
  );
}
