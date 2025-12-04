"use client";

import { useState } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { useWineryMap } from "@/hooks/use-winery-map";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Menu, X, Users, ChevronUp, ChevronDown } from "lucide-react";
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
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [sheetSize, setSheetSize] = useState<"mini" | "full">("mini");

  // Handle mobile nav click
  const handleMobileNav = (tab: "explore" | "trips" | "friends") => {
    setActiveTab(tab);
    setIsMobileSheetOpen(true);
    setSheetSize("mini"); // Start small
  };

  const toggleSheetSize = () => {
    setSheetSize((prev) => (prev === "mini" ? "full" : "mini"));
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

        {/* Custom Mobile Bottom Sheet */}
        <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="drawer-title"
            className={cn(
                "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t rounded-t-[10px] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex flex-col",
                "transition-all duration-300 ease-in-out",
                !isMobileSheetOpen ? "h-0 overflow-hidden opacity-0 invisible" : "opacity-100 visible",
                isMobileSheetOpen && sheetSize === "mini" ? "h-[40vh]" : "",
                isMobileSheetOpen && sheetSize === "full" ? "h-[85vh]" : ""
            )}
        >
            {/* Sheet Header / Handle */}
            <button
                type="button"
                aria-expanded={sheetSize === "full"}
                aria-controls="drawer-content"
                className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 rounded-t-[10px] shrink-0 cursor-pointer w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                onClick={toggleSheetSize}
            >
                <div className="flex-1 text-left">
                    <h2 id="drawer-title" className="text-sm font-semibold text-muted-foreground">
                        {activeTab === "explore" && "Explore"}
                        {activeTab === "trips" && "Trips"}
                        {activeTab === "friends" && "Friends"}
                        {activeTab === "history" && "History"}
                    </h2>
                </div>
                {/* Drag Handle Visual */}
                <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full mx-auto" />
                
                {/* Controls */}
                <div className="flex-1 flex justify-end gap-1">
                    <div className="h-8 w-8 flex items-center justify-center">
                        {sheetSize === "mini" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                    <div 
                        role="button"
                        tabIndex={0}
                        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent"
                        onClick={(e) => { e.stopPropagation(); setIsMobileSheetOpen(false); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                setIsMobileSheetOpen(false);
                            }
                        }}
                    >
                        <X className="h-4 w-4" />
                    </div>
                </div>
            </button>

            {/* Scrollable Content Area */}
            <div id="drawer-content" className="flex-1 overflow-y-auto pb-20">
                <AppSidebar 
                    user={user} 
                    {...wineryMapData} 
                    className="border-none h-full"
                    activeTab={activeTab}
                    onTabChange={(val) => setActiveTab(val as "explore" | "trips" | "friends" | "history")}
                />
            </div>
        </div>
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