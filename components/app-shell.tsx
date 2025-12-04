"use client";

import { useState, useRef } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { WineryMapProvider } from "@/components/winery-map-context";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Menu, X, Users, ChevronUp, ChevronDown, User as UserIcon, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleMapsProvider } from "@/components/google-maps-provider";
import dynamic from "next/dynamic";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

const WineryModal = dynamic(() => import("@/components/winery-modal"), {
  ssr: false,
});

interface AppShellProps {
  user: AuthenticatedUser;
  initialTab?: "explore" | "trips" | "friends" | "history";
}

function AppShellContent({ user, initialTab = "explore" }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<"explore" | "trips" | "friends" | "history">(initialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [sheetSize, setSheetSize] = useState<"mini" | "full">("mini");
  const touchStart = useRef<number | null>(null);

  // Handle mobile nav click
  const handleMobileNav = (tab: "explore" | "trips" | "friends" | "history") => {
    if (activeTab === tab && isMobileSheetOpen) {
        // Toggle size if clicking same tab
        setSheetSize(prev => prev === "mini" ? "full" : "mini");
    } else {
        setActiveTab(tab);
        setIsMobileSheetOpen(true);
        setSheetSize("mini"); // Start small
    }
  };

  const toggleSheetSize = () => {
    setSheetSize((prev) => (prev === "mini" ? "full" : "mini"));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchEnd - touchStart.current;

    // If swipe down is significant (> 50px) and we are in mini mode or just want to close it
    // For better UX: 
    // - If in full mode and swipe down -> go to mini? Or close? Usually full -> mini -> close.
    // - Let's keep it simple: Swipe down on header always closes/minimizes. 
    //   But user asked to "swipe it closed". So let's close it.
    if (diff > 50) {
        setIsMobileSheetOpen(false);
    }
    touchStart.current = null;
  };

  return (
      <div className="flex h-screen w-screen overflow-hidden flex-col md:flex-row relative">
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
                    activeTab={activeTab}
                    onTabChange={(val) => setActiveTab(val as any)}
                />
             </div>
          </div>
        </div>

        {/* Desktop Sidebar Toggle */}
        <Button
            variant="outline"
            size="icon"
            className="hidden md:flex absolute top-4 left-4 z-20 bg-background shadow-md"
            style={{ left: isSidebarOpen ? "416px" : "16px", transition: "left 0.3s ease-in-out" }}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
            {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>

        {/* Main Map Area */}
        <div className="flex-1 relative w-full h-full">
          <WineryMap />
          
          {/* Mobile User Avatar (Floating Top Right) */}
          <div className="md:hidden absolute top-4 right-4 z-10">
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <div className="bg-background/80 backdrop-blur-sm p-1 rounded-full shadow-sm border cursor-pointer hover:bg-background/90 transition-colors">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src="/placeholder-user.jpg" />
                            <AvatarFallback>{user.name?.charAt(0) || <UserIcon className="h-4 w-4" />}</AvatarFallback>
                        </Avatar>
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">{user.name}</p>
                            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link href="/logout" className="w-full cursor-pointer flex items-center text-red-600 focus:text-red-600">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
             </DropdownMenu>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t flex items-center justify-around z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto w-16", !isMobileSheetOpen && "text-primary")}
                onClick={() => setIsMobileSheetOpen(false)}
            >
                <MapIcon className="h-5 w-5" />
                <span className="text-[10px]">Map</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto w-16", activeTab === "explore" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("explore")}
            >
                <Search className="h-5 w-5" />
                <span className="text-[10px]">Explore</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto w-16", activeTab === "trips" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("trips")}
            >
                <CalendarDays className="h-5 w-5" />
                <span className="text-[10px]">Trips</span>
            </Button>
            <Button 
                variant="ghost" 
                className={cn("flex flex-col gap-1 h-auto w-16", activeTab === "friends" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("friends")}
            >
                <Users className="h-5 w-5" />
                <span className="text-[10px]">Friends</span>
            </Button>
        </div>

        {/* Custom Mobile Bottom Sheet */}
        <div
            className={cn(
                "md:hidden fixed bottom-16 left-0 right-0 z-40 bg-background border-t rounded-t-[15px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] flex flex-col",
                "transition-transform duration-300 ease-out will-change-transform", // Use transform for performance
                // Always set height based on sheetSize, use translate to hide
                sheetSize === "mini" ? "h-[45vh]" : "h-[calc(100vh-4rem)] top-4",
                !isMobileSheetOpen ? "translate-y-[150%]" : "translate-y-0" 
            )}
        >
            {/* Sheet Header / Handle */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b bg-muted/10 shrink-0 cursor-pointer w-full active:bg-muted/20 transition-colors rounded-t-[15px] touch-none"
                onClick={toggleSheetSize}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <div className="flex-1 text-left">
                    <h2 className="text-sm font-semibold text-foreground">
                        {activeTab === "explore" && "Explore Wineries"}
                        {activeTab === "trips" && "Trip Planner"}
                        {activeTab === "friends" && "Friends & Activity"}
                        {activeTab === "history" && "Visit History"}
                    </h2>
                </div>
                
                {/* Drag Handle Visual */}
                <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full absolute left-1/2 -translate-x-1/2" />
                
                {/* Controls */}
                <div className="flex-1 flex justify-end gap-2 items-center">
                    <div className="h-8 w-8 flex items-center justify-center text-muted-foreground">
                        {sheetSize === "mini" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                    
                    <div 
                        role="button"
                        tabIndex={0}
                        className="h-8 w-8 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted text-muted-foreground"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMobileSheetOpen(false);
                        }}
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
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-hidden relative bg-background">
                <AppSidebar 
                    user={user} 
                    className="border-none h-full"
                    activeTab={activeTab}
                    onTabChange={(val) => setActiveTab(val as any)}
                />
            </div>
        </div>
      </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <GoogleMapsProvider>
      <WineryMapProvider user={props.user}>
        <AppShellContent {...props} />
      </WineryMapProvider>
    </GoogleMapsProvider>
  );
}