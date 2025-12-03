"use client";

import { useState } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { useWineryMap } from "@/hooks/use-winery-map";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Menu, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleMapsProvider } from "@/components/google-maps-provider";
import dynamic from "next/dynamic";

const WineryModal = dynamic(() => import("@/components/winery-modal"), {
  ssr: false,
});

interface AppShellProps {
  user: AuthenticatedUser;
  initialTab?: "explore" | "trips";
}

function AppShellContent({ user, initialTab = "explore" }: AppShellProps) {
  const wineryMapData = useWineryMap(user.id);
  const [activeTab, setActiveTab] = useState<"explore" | "trips" | "friends" | "history">(initialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Handle mobile nav click
  const handleMobileNav = (tab: "explore" | "trips" | "friends") => {
    setActiveTab(tab);
    setIsMobileDrawerOpen(true);
  };

  return (
      <div className="flex h-[calc(100vh-4rem)] md:h-screen flex-col md:flex-row overflow-hidden">
        <WineryModal />
        {/* Desktop Sidebar */}
        <div
          className={cn(
            "hidden md:flex flex-col border-r bg-background transition-all duration-300 ease-in-out relative",
            isSidebarOpen ? "w-[400px]" : "w-0 opacity-0 overflow-hidden"
          )}
        >
          <div className="flex-1 overflow-hidden">
             {/* We force the Sidebar to render but hide it when width is 0 to preserve state if needed, 
                 but conditional rendering is better for performance if state isn't critical. 
                 For tabs, we want to keep state. */}
             <div className="w-[400px] h-full">
                <AppSidebar 
                    user={user} 
                    {...wineryMapData}
                    activeTab={activeTab}
                    onTabChange={(val) => setActiveTab(val as "explore" | "trips" | "friends" | "history")}
                />
             </div>
          </div>
        </div>

        {/* Desktop Sidebar Toggle */}
        <Button
            variant="outline"
            size="icon"
            className="hidden md:flex absolute top-20 left-4 z-20 bg-background shadow-md"
            style={{ left: isSidebarOpen ? "416px" : "16px", transition: "left 0.3s ease-in-out" }}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
            {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>

        {/* Main Map Area */}
        <div className="flex-1 relative w-full h-full">
          <WineryMap {...wineryMapData} />
        </div>

        {/* Mobile Navigation Bar (Replaces BottomNav) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t flex items-center justify-around z-50 pb-safe">
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "explore" && !isMobileDrawerOpen && "text-primary")}
                onClick={() => setIsMobileDrawerOpen(false)} // Close drawer to show map
            >
                <MapIcon className="h-5 w-5" />
                <span className="text-xs">Map</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "explore" && isMobileDrawerOpen && "text-primary")}
                onClick={() => handleMobileNav("explore")}
            >
                <Search className="h-5 w-5" />
                <span className="text-xs">Explore</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "trips" && isMobileDrawerOpen && "text-primary")}
                onClick={() => handleMobileNav("trips")}
            >
                <CalendarDays className="h-5 w-5" />
                <span className="text-xs">Trips</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "friends" && isMobileDrawerOpen && "text-primary")}
                onClick={() => handleMobileNav("friends")}
            >
                <Users className="h-5 w-5" />
                <span className="text-xs">Friends</span>
            </Button>
        </div>

        {/* Mobile Drawer */}
        <Drawer 
            open={isMobileDrawerOpen} 
            onOpenChange={setIsMobileDrawerOpen}
            snapPoints={[0.4, 0.85]}
            modal={false}
        >
            <DrawerContent className="h-[85vh]" overlay={false}>
                <DrawerHeader className="text-left">
                    <DrawerTitle>
                        {activeTab === "explore" && "Explore Wineries"}
                        {activeTab === "trips" && "Trip Planner"}
                        {activeTab === "friends" && "Friends"}
                    </DrawerTitle>
                    <DrawerDescription hidden>
                        Browse wineries or plan your trip.
                    </DrawerDescription>
                </DrawerHeader>
                <div className="px-4 h-full overflow-hidden pb-10">
                    {/* Re-using AppSidebar content logic but simplified for Drawer */}
                    <AppSidebar 
                        user={user} 
                        {...wineryMapData} 
                        className="border-none h-full"
                        activeTab={activeTab}
                        onTabChange={(val) => setActiveTab(val as "explore" | "trips" | "friends" | "history")}
                    />
                </div>
            </DrawerContent>
        </Drawer>
      </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <GoogleMapsProvider>
      <AppShellContent {...props} />
    </GoogleMapsProvider>
  );
}