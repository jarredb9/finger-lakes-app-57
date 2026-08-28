"use client";

import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFriendStore } from "@/lib/stores/friendStore";

export type NavTab = "explore" | "trips" | "friends" | "history";

export interface MobileNavBarProps {
  activeTab: NavTab;
  isMobileSheetOpen: boolean;
  onTabSelect: (tab: NavTab) => void;
  onMapSelect: () => void;
  className?: string;
}

export function MobileNavBar({
  activeTab,
  isMobileSheetOpen,
  onTabSelect,
  onMapSelect,
  className,
}: MobileNavBarProps) {
  const friendRequests = useFriendStore((state) => state.friendRequests);
  const friendRequestCount = friendRequests?.length || 0;

  return (
    <div
      data-testid="mobile-nav-bar"
      className={cn(
        "lg:hidden fixed bottom-4 left-4 right-4 max-w-lg mx-auto rounded-2xl border backdrop-blur-md shadow-lg bg-background/80 flex items-center justify-around z-50 pb-safe h-auto min-h-16 px-2 py-1",
        className
      )}
    >
      <Button
        variant="ghost"
        data-testid="mobile-nav-map"
        className={cn(
          "flex flex-col gap-1 h-auto w-16 px-3 py-1.5 transition-all duration-300 rounded-xl",
          !isMobileSheetOpen ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
        )}
        onClick={onMapSelect}
      >
        <MapIcon className={cn("h-5 w-5 transition-transform duration-300", !isMobileSheetOpen && "scale-110")} />
        <span className="text-[10px]">Map</span>
      </Button>

      <Button
        variant="ghost"
        data-testid="mobile-nav-explore"
        className={cn(
          "flex flex-col gap-1 h-auto w-16 px-3 py-1.5 transition-all duration-300 rounded-xl",
          activeTab === "explore" && isMobileSheetOpen ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
        )}
        onClick={() => onTabSelect("explore")}
      >
        <Search className={cn("h-5 w-5 transition-transform duration-300", activeTab === "explore" && isMobileSheetOpen && "scale-110")} />
        <span className="text-[10px]">Explore</span>
      </Button>

      <Button
        variant="ghost"
        data-testid="mobile-nav-trips"
        className={cn(
          "flex flex-col gap-1 h-auto w-16 px-3 py-1.5 transition-all duration-300 rounded-xl",
          activeTab === "trips" && isMobileSheetOpen ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
        )}
        onClick={() => onTabSelect("trips")}
      >
        <CalendarDays className={cn("h-5 w-5 transition-transform duration-300", activeTab === "trips" && isMobileSheetOpen && "scale-110")} />
        <span className="text-[10px]">Trips</span>
      </Button>

      <Button
        variant="ghost"
        data-testid="mobile-nav-friends"
        className={cn(
          "flex flex-col gap-1 h-auto w-16 relative px-3 py-1.5 transition-all duration-300 rounded-xl",
          activeTab === "friends" && isMobileSheetOpen ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
        )}
        onClick={() => onTabSelect("friends")}
      >
        <Users className={cn("h-5 w-5 transition-transform duration-300", activeTab === "friends" && isMobileSheetOpen && "scale-110")} />
        <span className="text-[10px]">Friends</span>
        {friendRequestCount > 0 && (
          <span
            data-testid="mobile-nav-friends-badge"
            className="absolute top-1 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white"
          >
            {friendRequestCount}
          </span>
        )}
      </Button>

      <Button
        variant="ghost"
        data-testid="mobile-nav-history"
        className={cn(
          "flex flex-col gap-1 h-auto w-16 px-3 py-1.5 transition-all duration-300 rounded-xl",
          activeTab === "history" && isMobileSheetOpen ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
        )}
        onClick={() => onTabSelect("history")}
      >
        <Clock className={cn("h-5 w-5 transition-transform duration-300", activeTab === "history" && isMobileSheetOpen && "scale-110")} />
        <span className="text-[10px]">History</span>
      </Button>
    </div>
  );
}
