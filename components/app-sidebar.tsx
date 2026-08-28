"use client";

import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthenticatedUser } from "@/lib/types";
import TripList from "@/components/trip-list";
import { cn } from "@/lib/utils";
import { MapPin, Route, History, Users } from "lucide-react";
import FriendsManager from "@/components/friends-manager";
import { useUIStore } from "@/lib/stores/uiStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { UserNav } from "@/components/nav/user-nav";
import { ExploreTabContent } from "@/components/sidebar/explore-tab-content";
import { HistoryTabContent } from "@/components/sidebar/history-tab-content";

export interface AppSidebarProps {
  user: AuthenticatedUser;
  className?: string;
  activeTab?: string;
  onTabChange?: (value: string) => void;
  hideTabs?: boolean;
}

export function AppSidebar({
  user,
  className,
  activeTab,
  onTabChange,
  hideTabs = false,
}: AppSidebarProps) {
  const isHydrated = useUIStore((state) => state.isHydrated);
  const friendRequests = useFriendStore((state) => state.friendRequests) || [];
  const friendRequestCount = friendRequests.length;

  return (
    <div data-testid="app-sidebar" className={cn("flex flex-col h-full bg-white dark:bg-zinc-950 border-r", className)}>
      {/* Branding Header & User Avatar */}
      <div className="p-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/wine-glass.svg" alt="Winery Tracker Logo" width={24} height={24} />
          <h1 className="text-lg font-bold tracking-tight">Winery Tracker</h1>
        </div>

        {/* User Avatar Dropdown - Desktop */}
        <UserNav user={user} className="hidden lg:block" />
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="explore" value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col overflow-hidden">
        {!hideTabs && (
          <div className={cn("px-4 py-2 border-b bg-muted/10 shrink-0", !isHydrated && "opacity-50 pointer-events-none")}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="explore" className="flex items-center gap-2 px-1" aria-label="Explore">
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline">Explore</span>
              </TabsTrigger>
              <TabsTrigger value="trips" className="flex items-center gap-2 px-1" aria-label="Trips">
                <Route className="w-4 h-4" />
                <span className="hidden sm:inline">Trips</span>
              </TabsTrigger>
              <TabsTrigger value="friends" className="relative flex items-center gap-2 px-1" aria-label="Friends">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Friends</span>
                {friendRequestCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {friendRequestCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2 px-1" aria-label="History">
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
            </TabsList>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="explore" className="m-0 h-full data-[state=active]:flex flex-col">
            <ExploreTabContent />
          </TabsContent>

          <TabsContent value="trips" className="m-0 pb-20">
            <div className="p-4 space-y-6">
              <TripList user={user} onExploreClick={() => onTabChange?.("explore")} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="m-0 pb-20">
            <HistoryTabContent isActive={activeTab === "history"} />
          </TabsContent>

          <TabsContent value="friends" className="m-0 pb-20">
            <div className="p-4 space-y-4">
              <FriendsManager />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
