"use client";

import { useState, useEffect } from "react";
import { AuthenticatedUser } from "@/lib/types";
import { WineryMapProvider } from "@/components/winery-map-context";
import { MapProvider } from "react-map-gl/mapbox";
import WineryMap from "@/components/WineryMap";
import { AppSidebar } from "@/components/app-sidebar";
import { User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/lib/stores/uiStore";
import { InteractiveBottomSheet, SheetMode } from "@/components/ui/interactive-bottom-sheet";
import { useMapStore } from "@/lib/stores/mapStore";
import { VisitHistoryModal } from "@/components/visit-history-modal";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useLayoutTier } from "@/hooks/use-layout-tier";
import { useMounted } from "@/hooks/use-mounted";
import { TabletFloatingDrawer } from "@/components/layout/TabletFloatingDrawer";
import { MobileNavBar, NavTab } from "@/components/layout/MobileNavBar";
import { WineryModal } from "@/components/winery-modal";
import { UserNav } from "@/components/nav/user-nav";

interface AppShellProps {
    user: AuthenticatedUser;
    initialTab?: NavTab;
}

function AppShellContent({ user, initialTab = "explore" }: AppShellProps) {
    const { isMobile, isTablet, isDesktop } = useLayoutTier();
    const isStreetViewActive = useMapStore(state => state.isStreetViewActive);
    const [activeTab, setActiveTab] = useState<NavTab>(initialTab);
    const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(initialTab !== "explore");
    const [sheetMode, setSheetMode] = useState<SheetMode>("mini");
    const setHydrated = useUIStore(state => state.setHydrated);
    const mounted = useMounted();

    useEffect(() => {
        if (mounted) {
            setHydrated(true);
        }
    }, [mounted, setHydrated]);

    // Handle mobile nav click
    const handleMobileNav = (tab: NavTab) => {
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
                <MobileNavBar
                    activeTab={activeTab}
                    isMobileSheetOpen={isMobileSheetOpen}
                    onTabSelect={handleMobileNav}
                    onMapSelect={() => setIsMobileSheetOpen(false)}
                />
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
