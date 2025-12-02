"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuthenticatedUser } from "@/lib/types";
import { useWineryMap } from "@/hooks/use-winery-map";
import WinerySearchResults from "@/components/map/WinerySearchResults";
import TripList from "@/components/trip-list";
import TripPlanner from "@/components/trip-planner";
import { MapPin, Route } from "lucide-react";

type WineryMapData = ReturnType<typeof useWineryMap>;

interface AppSidebarProps extends WineryMapData {
  user: AuthenticatedUser;
  className?: string;
  activeTab?: string;
  onTabChange?: (value: string) => void;
}

export function AppSidebar({ user, className, listResultsInView, isSearching, handleOpenModal, activeTab, onTabChange }: AppSidebarProps) {
  return (
    <div className={`flex flex-col h-full bg-white dark:bg-zinc-950 border-r ${className}`}>
      <Tabs defaultValue="explore" value={activeTab} onValueChange={onTabChange} className="flex flex-col h-full">
        <div className="px-4 py-2 border-b bg-white dark:bg-zinc-950 z-10">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="explore" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Explore
            </TabsTrigger>
            <TabsTrigger value="trips" className="flex items-center gap-2">
              <Route className="w-4 h-4" />
              Trips
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="explore" className="flex-1 overflow-hidden p-0 m-0 data-[state=active]:flex flex-col">
           <div className="flex-1 overflow-y-auto">
             <div className="p-4 space-y-6">
               {/* Legend Section */}
               <Card className="border-none shadow-none bg-transparent">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="text-sm font-semibold">Map Legend</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#f17e3a] border border-[#d26e32]" />
                        <span className="text-sm text-muted-foreground">Trip Stop</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#FBBF24] border border-[#F59E0B]" />
                        <span className="text-sm text-muted-foreground">Favorite</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#9333ea] border border-[#7e22ce]" />
                        <span className="text-sm text-muted-foreground">Want to Go</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#10B981] border border-[#059669]" />
                        <span className="text-sm text-muted-foreground">Visited</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#3B82F6] border border-[#2563EB]" />
                        <span className="text-sm text-muted-foreground">Discovered</span>
                    </div>
                  </CardContent>
               </Card>

               <Separator />

               {/* Search Results */}
               <div className="space-y-2">
                 <h3 className="text-sm font-semibold">Wineries in View</h3>
                 <WinerySearchResults 
                    listResultsInView={listResultsInView} 
                    isSearching={isSearching} 
                    handleOpenModal={handleOpenModal} 
                 />
               </div>
             </div>
           </div >
        </TabsContent>

        <TabsContent value="trips" className="flex-1 overflow-hidden p-0 m-0 data-[state=active]:flex flex-col">
          <div className="flex-1 overflow-y-auto">
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
          </div >
        </TabsContent>
      </Tabs>
    </div>
  );
}
