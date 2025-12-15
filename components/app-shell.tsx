"use client";

import { useState } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { WineryMapProvider } from "@/components/winery-map-context";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Menu, X, Users, User as UserIcon, LogOut, FileText, Shield } from "lucide-react";
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
import { InteractiveBottomSheet, SheetMode } from "@/components/ui/interactive-bottom-sheet";
import { useFriendStore } from "@/lib/stores/friendStore";

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
  const [sheetMode, setSheetMode] = useState<SheetMode>("mini");
  const { friendRequests } = useFriendStore();

  const friendRequestCount = friendRequests.length;

  // Handle mobile nav click
  const handleMobileNav = (tab: "explore" | "trips" | "friends" | "history") => {
    if (activeTab === tab && isMobileSheetOpen) {
        // Toggle size if clicking same tab
        setSheetMode(prev => prev === "mini" ? "full" : "mini");
    } else {
        setActiveTab(tab);
        setIsMobileSheetOpen(true);
        setSheetMode("mini"); // Start small
    }
  };

  const getSheetTitle = () => {
      switch (activeTab) {
          case "explore": return "Explore Wineries";
          case "trips": return "Trip Planner";
          case "friends": return "Friends & Activity";
          case "history": return "Visit History";
          default: return "Menu";
      }
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
                        <Link href="/privacy" className="w-full cursor-pointer flex items-center">
                            <Shield className="mr-2 h-4 w-4" />
                            <span>Privacy Policy</span>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/terms" className="w-full cursor-pointer flex items-center">
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Terms of Service</span>
                        </Link>
                    </DropdownMenuItem>
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-auto min-h-16 bg-background border-t flex items-center justify-around z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
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
                className={cn("flex flex-col gap-1 h-auto w-16 relative", activeTab === "friends" && isMobileSheetOpen && "text-primary")}
                onClick={() => handleMobileNav("friends")}
            >
                <Users className="h-5 w-5" />
                <span className="text-[10px]">Friends</span>
                {friendRequestCount > 0 && (
                  <span className="absolute top-1 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {friendRequestCount}
                  </span>
                )}
            </Button>
        </div>

        {/* Custom Mobile Bottom Sheet */}
        <InteractiveBottomSheet
            isOpen={isMobileSheetOpen}
            onOpenChange={setIsMobileSheetOpen}
            mode={sheetMode}
            onModeChange={setSheetMode}
            title={getSheetTitle()}
        >
            <AppSidebar 
                user={user} 
                className="border-none h-full"
                activeTab={activeTab}
                onTabChange={(val) => setActiveTab(val as any)}
            />
        </InteractiveBottomSheet>
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