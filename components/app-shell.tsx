"use client";

import { useState } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { useWineryMap } from "@/hooks/use-winery-map";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Menu, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleMapsProvider } from "@/components/google-maps-provider";
import dynamic from "next/dynamic";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

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
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(0.4);

  // Handle mobile nav click
  const handleMobileNav = (tab: "explore" | "trips" | "friends") => {
    setActiveTab(tab);
    setIsMobileSheetOpen(true);
    setSnap(0.4); // Default to mini view
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

        {/* Mobile Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t flex items-center justify-around z-50 pb-safe">
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", !isMobileSheetOpen && "text-primary")}
                onClick={() => setIsMobileSheetOpen(false)}
            >
                <MapIcon className="h-5 w-5" />
                <span className="text-xs">Map</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "explore" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("explore")}
            >
                <Search className="h-5 w-5" />
                <span className="text-xs">Explore</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "trips" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("trips")}
            >
                <CalendarDays className="h-5 w-5" />
                <span className="text-xs">Trips</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto", activeTab === "friends" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("friends")}
            >
                <Users className="h-5 w-5" />
                <span className="text-xs">Friends</span>
            </Button>
        </div>

        {/* Shadcn Drawer for Mobile Sheet */}
        <Drawer 
            open={isMobileSheetOpen} 
            onOpenChange={setIsMobileSheetOpen}
            modal={false}
            snapPoints={[0.4, 0.85]}
            activeSnapPoint={snap}
            setActiveSnapPoint={setSnap}
        >
            <DrawerContent overlay={false} className="h-[85vh] flex flex-col fixed bottom-16 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] focus:outline-none">
                <DrawerHeader className="border-b bg-muted/30">
                    <DrawerTitle className="text-center text-muted-foreground text-sm">
                        {activeTab === "explore" && "Explore"}
                        {activeTab === "trips" && "Trips"}
                        {activeTab === "friends" && "Friends"}
                        {activeTab === "history" && "History"}
                    </DrawerTitle>
                </DrawerHeader>
                <div className="flex-1 overflow-y-auto">
                    <AppSidebar 
                        user={user} 
                        {...wineryMapData} 
                        className="border-none h-full w-full"
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