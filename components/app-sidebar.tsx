"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { AuthenticatedUser } from "@/lib/types";
import { useWineryMapContext } from "@/components/winery-map-context";
import WinerySearchResults from "@/components/map/WinerySearchResults";
import TripList from "@/components/trip-list";
import TripPlanner from "@/components/trip-planner";
import GlobalVisitHistory from "@/components/global-visit-history";
import { MapPin, Route, History, Info, Users, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FriendsManager from "@/components/friends-manager";
import { MapControls } from "@/components/map/map-controls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AppSidebarProps {
  user: AuthenticatedUser;
  className?: string;
  activeTab?: string;
  onTabChange?: (value: string) => void;
}

export function AppSidebar({ 
  user, 
  className, 
  activeTab, 
  onTabChange,
}: AppSidebarProps) {
  
  const {
    listResultsInView, 
    isSearching, 
    handleOpenModal, 
    hitApiLimit,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    handleSearchSubmit,
    handleManualSearchArea,
    filter,
    handleFilterChange,
  } = useWineryMapContext();

  // Memoize expensive tab contents
  const tripsContent = useMemo(() => (
    <div className="p-4 space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Plan a Trip</h3>
        <TripPlanner initialDate={new Date()} user={user} />
      </div>
      <Separator />
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Your Upcoming Trips</h3>
        <TripList />
      </div>
    </div>
  ), [user]);

  const historyContent = useMemo(() => (
    <div className="p-4 space-y-4">
      <h3 className="text-lg font-semibold">My Visit History</h3>
      <GlobalVisitHistory />
    </div>
  ), []);

  const friendsContent = useMemo(() => (
    <div className="p-4 space-y-4">
      <FriendsManager />
    </div>
  ), []);

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-zinc-950 border-r ${className || ''}`}>
      {/* Branding Header */}
      <div className="p-4 border-b flex items-center gap-3 shrink-0">
        <Image src="/wine-glass.svg" alt="Logo" width={24} height={24} />
        <h1 className="text-lg font-bold tracking-tight">Winery Tracker</h1>
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="explore" value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/10 shrink-0">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="explore" className="flex items-center gap-2 px-1">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Explore</span>
            </TabsTrigger>
            <TabsTrigger value="trips" className="flex items-center gap-2 px-1">
              <Route className="w-4 h-4" />
              <span className="hidden sm:inline">Trips</span>
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex items-center gap-2 px-1">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Friends</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 px-1">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="explore" className="m-0 h-full flex flex-col">
             <div className="p-4 space-y-4 pb-20">
               
               <MapControls 
                 searchLocation={searchLocation}
                 setSearchLocation={setSearchLocation}
                 isSearching={isSearching}
                 handleSearchSubmit={handleSearchSubmit}
                 handleManualSearchArea={handleManualSearchArea}
                 autoSearch={autoSearch}
                 setAutoSearch={setAutoSearch}
                 hitApiLimit={hitApiLimit}
                 filter={filter}
                 handleFilterChange={handleFilterChange}
               />

               <Separator />

               <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Wineries in View</h3>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
                                <Info className="w-3 h-3 mr-1" /> Legend
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56" align="end">
                             <div className="space-y-2">
                                <h4 className="font-semibold text-sm">Map Legend</h4>
                                <div className="grid gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#f17e3a] border border-[#d26e32]" />
                                        <span className="text-xs text-muted-foreground">Trip Stop</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#FBBF24] border border-[#F59E0B]" />
                                        <span className="text-xs text-muted-foreground">Favorite</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#9333ea] border border-[#7e22ce]" />
                                        <span className="text-xs text-muted-foreground">Want to Go</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#10B981] border border-[#059669]" />
                                        <span className="text-xs text-muted-foreground">Visited</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#3B82F6] border border-[#2563EB]" />
                                        <span className="text-xs text-muted-foreground">Discovered</span>
                                    </div>
                                </div>
                             </div>
                        </PopoverContent>
                    </Popover>
                 </div>
                 <WinerySearchResults 
                    listResultsInView={listResultsInView} 
                    isSearching={isSearching} 
                    handleOpenModal={handleOpenModal} 
                 />
               </div>
             </div>
          </TabsContent>

          <TabsContent value="trips" className="m-0 pb-20">
            {tripsContent}
          </TabsContent>

          <TabsContent value="history" className="m-0 pb-20">
            {historyContent}
          </TabsContent>

          <TabsContent value="friends" className="m-0 pb-20">
            {friendsContent}
          </TabsContent>
        </div>
      </Tabs>

      {/* User Footer */}
      <div className="p-4 border-t bg-muted/10 shrink-0">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border">
                    <AvatarImage src="/placeholder-user.jpg" />
                    <AvatarFallback>{user.name?.charAt(0) || <UserIcon className="h-4 w-4" />}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">{user.name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">{user.email}</span>
                </div>
            </div>
            <Link href="/logout">
                <Button variant="ghost" size="icon" title="Logout">
                    <LogOut className="h-4 w-4 text-muted-foreground" />
                </Button>
            </Link>
        </div>
      </div>
    </div>
  );
}