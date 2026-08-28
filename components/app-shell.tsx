"use client";

import { useState, useEffect } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { WineryMapProvider } from "@/components/winery-map-context";
import { MapProvider } from "react-map-gl/mapbox";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, CalendarDays, Search, Users, User as UserIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/lib/stores/uiStore";
import { InteractiveBottomSheet, SheetMode } from "@/components/ui/interactive-bottom-sheet";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { VisitHistoryModal } from "@/components/visit-history-modal";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useLayoutTier } from "@/hooks/use-layout-tier";
import { useMounted } from "@/hooks/use-mounted";
import { TabletFloatingDrawer } from "@/components/layout/TabletFloatingDrawer";
import { WineryModal } from "@/components/winery-modal";
import { UserNav } from "@/components/nav/user-nav";

interface AppShellProps {
    user: AuthenticatedUser;
    initialTab?: "explore" | "trips" | "friends" | "history";
}

function AppShellContent({ user, initialTab = "explore" }: AppShellProps) {
    const { isMobile, isTablet, isDesktop } = useLayoutTier();
    const isStreetViewActive = useMapStore(state => state.isStreetViewActive);
    const [activeTab, setActiveTab] = useState<"explore" | "trips" | "friends" | "history">(initialTab);
    const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(initialTab !== "explore");
    const [sheetMode, setSheetMode] = useState<SheetMode>("mini");
    const { friendRequests = [] } = useFriendStore();
    const setHydrated = useUIStore(state => state.setHydrated);
    const mounted = useMounted();

    const friendRequestCount = friendRequests?.length || 0;

    useEffect(() => {
        if (mounted) {
            setHydrated(true);
        }
    }, [mounted, setHydrated]);

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
        <div 
            className="flex h-screen w-screen overflow-hidden flex-col lg:flex-row relative"
            data-hydrated={mounted}
        >
            <h1 className="sr-only">Winery Visit Planner and Tracker</h1>
            <OfflineIndicator />
            <WineryModal />
            <VisitHistoryModal />

            {/* Desktop Sidebar */}
            {isDesktop && (
                <div className="hidden lg:flex flex-col border-r bg-background w-[400px] relative shrink-0">
                    <div className="flex-1 overflow-hidden">
                        <div data-testid="desktop-sidebar-container" className="w-[400px] h-full">
                            <AppSidebar
                                user={user}
                                activeTab={activeTab}
                                onTabChange={(val) => setActiveTab(val as any)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Main Map Area */}
            <div className="flex-1 relative w-full h-full">
                <WineryMap className={isMobile && isMobileSheetOpen ? "sheet-open" : "sheet-closed"} />

                {/* Mobile User Avatar (Floating Top Right) */}
                {isMobile && isStreetViewActive === false && (
                    <div className="lg:hidden absolute top-4 right-4 z-10">
                        <UserNav
                            user={user}
                            trigger={
                                <div
                                    className="bg-background/80 backdrop-blur-xs p-1 rounded-full shadow-xs border cursor-pointer hover:bg-background/90 transition-colors"
                                    role="button"
                                    aria-label="User profile and navigation"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src="/placeholder-user.jpg" alt={user.name || "User avatar"} />
                                        <AvatarFallback>{user.name?.charAt(0) || <UserIcon className="h-4 w-4" />}</AvatarFallback>
                                    </Avatar>
                                </div>
                            }
                        />
                    </div>
                )}
            </div>

            {/* Tablet Floating Drawer */}
            {isTablet && isStreetViewActive === false && (
                <TabletFloatingDrawer
                    user={user}
                    activeTab={activeTab}
                    onTabChange={(val) => setActiveTab(val as any)}
                />
            )}

            {/* Mobile Navigation Bar */}
            {isMobile && isStreetViewActive === false && (
                <div
                    data-testid="mobile-nav-bar"
                    className="lg:hidden fixed bottom-4 left-4 right-4 max-w-lg mx-auto rounded-2xl border backdrop-blur-md shadow-lg bg-background/80 flex items-center justify-around z-50 pb-safe h-auto min-h-16 px-2 py-1"
                >
                    <Button
                        variant="ghost"
                        data-testid="mobile-nav-map"
                        className={cn(
                            "flex flex-col gap-1 h-auto w-16 px-3 py-1.5 transition-all duration-300 rounded-xl",
                            !isMobileSheetOpen ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
                        )}
                        onClick={() => setIsMobileSheetOpen(false)}
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
                        onClick={() => handleMobileNav("explore")}
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
                        onClick={() => handleMobileNav("trips")}
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
                        onClick={() => handleMobileNav("friends")}
                    >
                        <Users className={cn("h-5 w-5 transition-transform duration-300", activeTab === "friends" && isMobileSheetOpen && "scale-110")} />
                        <span className="text-[10px]">Friends</span>
                        {friendRequestCount > 0 && (
                            <span className="absolute top-1 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
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
                        onClick={() => handleMobileNav("history")}
                    >
                        <Clock className={cn("h-5 w-5 transition-transform duration-300", activeTab === "history" && isMobileSheetOpen && "scale-110")} />
                        <span className="text-[10px]">History</span>
                    </Button>
                </div>
            )}

            {/* Custom Mobile Bottom Sheet */}
            {isMobile && isStreetViewActive === false && (
                <InteractiveBottomSheet
                    data-testid="mobile-sidebar-container"
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
                        hideTabs={true}
                    />
                </InteractiveBottomSheet>
            )}
        </div>
    );
}

export function AppShell(props: AppShellProps) {
    return (
        <MapProvider>
            <WineryMapProvider user={props.user}>
                <AppShellContent {...props} />
            </WineryMapProvider>
        </MapProvider>
    );
}
