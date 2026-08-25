"use client";

import { useState } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapStore } from "@/lib/stores/mapStore";

export interface TabletFloatingDrawerProps {
  user: AuthenticatedUser;
  activeTab?: "explore" | "trips" | "friends" | "history";
  onTabChange?: (tab: "explore" | "trips" | "friends" | "history") => void;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}

export function TabletFloatingDrawer({
  user,
  activeTab = "explore",
  onTabChange,
  isCollapsed: controlledIsCollapsed,
  onCollapsedChange,
  className,
}: TabletFloatingDrawerProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalCollapsed;

  const { filter = [], searchLocation = "" } = useMapStore();

  const activeFilterCount = filter.filter((f) => f && f !== "all").length;

  const handleToggle = (nextState: boolean) => {
    if (controlledIsCollapsed === undefined) {
      setInternalCollapsed(nextState);
    }
    onCollapsedChange?.(nextState);
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case "trips":
        return "Trips";
      case "friends":
        return "Friends";
      case "history":
        return "History";
      case "explore":
      default:
        return searchLocation ? searchLocation : "Explore Wineries";
    }
  };

  if (isCollapsed) {
    return (
      <div
        data-testid="tablet-floating-drawer"
        data-state="collapsed"
        className={cn(
          "absolute top-4 left-4 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-md shadow-xl rounded-full border border-border px-3 py-1.5 h-12 select-none cursor-pointer hover:bg-background/90 transition-all",
          className
        )}
        onClick={() => handleToggle(false)}
      >
        <Button
          variant="ghost"
          size="icon"
          data-testid="tablet-drawer-expand-button"
          aria-label="Expand panel"
          className="h-8 w-8 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle(false);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 text-xs font-medium max-w-[180px] truncate pr-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{getTabLabel()}</span>
        </div>

        {activeFilterCount > 0 && (
          <Badge
            data-testid="tablet-filter-badge"
            variant="secondary"
            className="flex items-center gap-1 h-5 px-1.5 text-[10px] font-semibold bg-primary/10 text-primary border-primary/20"
          >
            <SlidersHorizontal className="h-2.5 w-2.5" />
            {activeFilterCount}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="tablet-floating-drawer"
      data-state="expanded"
      className={cn(
        "absolute top-4 left-4 bottom-4 w-[380px] z-40 flex flex-col bg-background/95 backdrop-blur-md shadow-2xl rounded-2xl border border-border overflow-hidden transition-all duration-300",
        className
      )}
    >
      {/* Tablet Drawer Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Winery Planner
          </span>
          {activeFilterCount > 0 && (
            <Badge
              data-testid="tablet-expanded-filter-badge"
              variant="outline"
              className="text-[10px] h-4 px-1"
            >
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          data-testid="tablet-drawer-collapse-button"
          aria-label="Collapse panel"
          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => handleToggle(true)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Drawer Body with AppSidebar */}
      <div className="flex-1 overflow-hidden">
        <AppSidebar
          user={user}
          className="border-none h-full bg-transparent"
          activeTab={activeTab}
          onTabChange={(val) => onTabChange?.(val as any)}
        />
      </div>
    </div>
  );
}
