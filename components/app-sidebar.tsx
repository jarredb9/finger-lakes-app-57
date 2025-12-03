"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuthenticatedUser } from "@/lib/types";
import { useWineryMap } from "@/hooks/use-winery-map";
import WinerySearchResults from "@/components/map/WinerySearchResults";
import TripList from "@/components/trip-list";
import TripPlanner from "@/components/trip-planner";
import GlobalVisitHistory from "@/components/global-visit-history";
import { MapPin, Route, History, Search, Loader2, XCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useTripStore } from "@/lib/stores/tripStore";

type WineryMapData = ReturnType<typeof useWineryMap>;

interface AppSidebarProps extends WineryMapData {
  user: AuthenticatedUser;
  className?: string;
  activeTab?: string;
  onTabChange?: (value: string) => void;
}

export function AppSidebar({ 
  user, 
  className, 
  listResultsInView, 
  isSearching, 
  handleOpenModal, 
  activeTab, 
  onTabChange,
  // Map Data Props
  hitApiLimit,
  searchLocation,
  setSearchLocation,
  autoSearch,
  setAutoSearch,
  handleSearchSubmit,
  handleManualSearchArea,
  filter,
  handleFilterChange,
}: AppSidebarProps) {
  const { upcomingTrips, fetchTripById, selectedTrip, setSelectedTrip } = useTripStore();

  const handleTripSelect = async (tripId: string) => {
    if (tripId === "none") {
      setSelectedTrip(null);
      return;
    }
    await fetchTripById(tripId);
    const updatedTrip = useTripStore.getState().trips.find((t) => t.id.toString() === tripId);
    if (updatedTrip) setSelectedTrip(updatedTrip);
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-zinc-950 border-r ${className}`}>
      <Tabs defaultValue="explore" value={activeTab} onValueChange={onTabChange} className="flex flex-col h-full">
        <div className="px-4 py-2 border-b bg-white dark:bg-zinc-950 z-10">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="explore" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Explore
            </TabsTrigger>
            <TabsTrigger value="trips" className="flex items-center gap-2">
              <Route className="w-4 h-4" />
              Trips
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="explore" className="flex-1 overflow-hidden p-0 m-0 data-[state=active]:flex flex-col">
           <div className="flex-1 overflow-y-auto">
             <div className="p-4 space-y-6">
               
               {/* --- Map Controls (Search & Filter) --- */}
               <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                      <form onSubmit={handleSearchSubmit} className="flex gap-2">
                        <Input
                            placeholder="City or region..."
                            value={searchLocation}
                            onChange={(e) => setSearchLocation(e.target.value)}
                            className="flex-1"
                        />
                        <Button type="submit" size="icon" disabled={isSearching}>
                            {isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                        </Button>
                      </form>
                      <Button variant="outline" size="sm" onClick={handleManualSearchArea} disabled={isSearching} className="w-full">
                         <MapPin className="mr-2 w-4 h-4" /> Search This Area
                      </Button>
                  </div>

                  {hitApiLimit && (
                    <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800 py-2">
                        <AlertTriangle className="h-4 w-4 !text-yellow-600" />
                        <AlertDescription className="text-xs">Zoom in to see more results.</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                       <div className="space-y-2">
                          <span className="text-xs font-medium uppercase text-muted-foreground">Filter Wineries</span>
                          {selectedTrip ? (
                              <div className="flex items-center">
                                  <Badge className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer" onClick={() => setSelectedTrip(null)}>
                                      Viewing: {selectedTrip.name} <XCircle className="w-3 h-3 ml-1" />
                                  </Badge>
                              </div>
                          ) : (
                              <ToggleGroup type="multiple" value={filter} onValueChange={handleFilterChange} className="justify-start flex-wrap gap-2" size="sm">
                                  <ToggleGroupItem value="all" className="text-xs h-7 px-2">All</ToggleGroupItem>
                                  <ToggleGroupItem value="visited" className="text-xs h-7 px-2">Visited</ToggleGroupItem>
                                  <ToggleGroupItem value="favorites" className="text-xs h-7 px-2">Favorites</ToggleGroupItem>
                                  <ToggleGroupItem value="wantToGo" className="text-xs h-7 px-2">Want to Go</ToggleGroupItem>
                                  <ToggleGroupItem value="notVisited" className="text-xs h-7 px-2">Discovered</ToggleGroupItem>
                              </ToggleGroup>
                          )}
                      </div>

                      <div className="space-y-2">
                          <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs font-medium uppercase text-muted-foreground">Trip Overlay</span>
                          </div>
                          <Select value={selectedTrip?.id?.toString() || "none"} onValueChange={handleTripSelect}>
                            <SelectTrigger className="w-full h-9 text-sm">
                                <SelectValue placeholder="Show a trip on the map..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {upcomingTrips.filter((trip) => !!trip.id).map((trip) => (
                                    <SelectItem key={trip.id} value={trip.id.toString()}>
                                    {trip.name} ({new Date(trip.trip_date + "T00:00:00").toLocaleDateString()})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-blue-50/50 rounded-lg border border-blue-200">
                        <Label htmlFor="auto-search" className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} className="scale-75" />
                        Auto-search when moving map
                        </Label>
                    </div>
                  </div>
               </div>

               <Separator />

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

        <TabsContent value="history" className="flex-1 overflow-hidden p-0 m-0 data-[state=active]:flex flex-col">
            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                    <h3 className="text-lg font-semibold">My Visit History</h3>
                    <GlobalVisitHistory />
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
