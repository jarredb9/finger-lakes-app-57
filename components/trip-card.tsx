import { memo, useState, useEffect } from "react";
import { Trip, Winery, Friend, Visit } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar, Users, MapPin, GripVertical, Trash2, Edit, Save, Plus, X, UserPlus, Check, Share2, Star } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { DatePicker } from "./DatePicker";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import DailyHours from "@/components/DailyHours";
import WineryNoteEditor from "./WineryNoteEditor";
import { cn } from "@/lib/utils";
import { useTripActions } from "@/hooks/use-trip-actions";
import { calculateDistance, formatDistance } from "@/lib/utils/geo";

interface TripCardProps {
  trip: Trip;
}

const WineryReviews = ({ visits, currentUserId, members }: { visits: Visit[], currentUserId: string, members: Friend[] }) => {
  if (!visits || visits.length === 0) {
    return null;
  }

  const getReviewerName = (visit: Visit) => {
    if (visit.user_id === currentUserId) return 'You';
    return visit.profiles?.name || 'A friend';
  };

  const getReviewerEmail = (visit: Visit) => {
    if (visit.user_id === currentUserId) return 'you@example.com'; // Placeholder for current user
    const member = members.find(m => m.id === visit.user_id);
    return member?.email || 'friend@example.com'; // Placeholder for friend
  };

  return (
    <div className="mt-2 space-y-2">
      {visits.map((visit, index) => (
        <div key={index} className="text-xs p-2 bg-slate-100 rounded-md border border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-5 w-5">
              <AvatarImage src={`https://i.pravatar.cc/150?u=${getReviewerEmail(visit)}`} />
              <AvatarFallback>{getReviewerName(visit).charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="font-semibold">{getReviewerName(visit)}</span>
            <div className="flex items-center gap-0.5 ml-auto">
              <Star className={`w-3 h-3 ${visit.rating && visit.rating >= 1 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
              <Star className={`w-3 h-3 ${visit.rating && visit.rating >= 2 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
              <Star className={`w-3 h-3 ${visit.rating && visit.rating >= 3 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
              <Star className={`w-3 h-3 ${visit.rating && visit.rating >= 4 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
              <Star className={`w-3 h-3 ${visit.rating && visit.rating >= 5 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
            </div>
          </div>
          <p className="italic text-slate-600 pl-7">&ldquo;{visit.user_review}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}

const TripCard = memo(({ trip }: TripCardProps) => {
  const { toast } = useToast();
  const { updateTrip, deleteTrip, updateWineryOrder, toggleWineryOnTrip, removeWineryFromTrip, saveWineryNote, addMembersToTrip } = useTripStore();
  
  const { 
    friends, 
    selectedFriends, 
    currentMembers, 
    handleExportToMaps, 
    toggleFriendSelection 
  } = useTripActions(trip);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(trip.name || "");
  const [editedDate, setEditedDate] = useState<Date | undefined>(new Date(trip.trip_date));
  const [winerySearch, setWinerySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [addWineryPopoverOpen, setAddWineryPopoverOpen] = useState(false);

  useEffect(() => {
    if (!winerySearch.trim()) {
      setSearchResults([]);
      return;
    }

    const debounceSearch = setTimeout(() => {
      const search = async () => {
        setIsSearching(true);
        const fetchUrl = `/api/wineries?query=${encodeURIComponent(winerySearch)}`;
        try {
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            throw new Error('Search failed');
          }
          const results: Winery[] = await response.json();
          // Filter out wineries already in the trip
          const tripWineryIds = new Set((trip.wineries || []).map(w => w.id));
          const finalResults = results.filter(r => !tripWineryIds.has(r.id));
          setSearchResults(finalResults);
        } catch (error) {
          console.error("[TripCard] Winery search failed:", error);
          toast({ variant: "destructive", description: "Winery search failed." });
        } finally {
          setIsSearching(false);
        }
      };
      search();
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceSearch);
  }, [winerySearch, trip.wineries, toast]);

  // Get the most up-to-date winery data from the persistent store
  const tripWineries = trip.wineries || [];

  const handleDrop = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(tripWineries);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    const newWineryIds = items.map(item => item.dbId as number);
    updateWineryOrder(trip.id.toString(), newWineryIds);
  };

  const handleSave = async () => {
    if (!editedDate) {
      toast({ title: "Error", description: "Trip date cannot be empty.", variant: "destructive" });
      return;
    }
    try {
      await updateTrip(trip.id.toString(), { name: editedName, trip_date: editedDate.toISOString().split('T')[0] });
      setIsEditing(false);
      toast({ description: "Trip updated successfully." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update trip." });
    }
  };

  const handleAddWinery = async (winery: Winery) => {
    try {
      toggleWineryOnTrip(winery, trip);
      setWinerySearch("");
      setSearchResults([]);
      setAddWineryPopoverOpen(false); // Close popover on selection
      toast({ description: `${winery.name} added to trip.` });
    } catch (error) {
      toast({ variant: "destructive", description: `Failed to add ${winery.name}.` });
    }
  };

  const handleRemoveWinery = async (wineryDbId: number) => {
    try {
      await removeWineryFromTrip(trip.id.toString(), wineryDbId);
      toast({ description: "Winery removed from trip." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to remove winery." });
    }
  };

  const handleSaveNote = async (wineryId: number, newNotes: string) => {
    try {
      await saveWineryNote(trip.id.toString(), wineryId, newNotes);
      toast({ description: "Notes saved." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to save notes." });
    }
  };

  const onFriendSelect = (friendId: string) => {
    const newSelectedFriends = toggleFriendSelection(friendId);
    
    addMembersToTrip(trip.id.toString(), newSelectedFriends)
      .then(() => {
        toast({ description: "Trip members updated." });
      })
      .catch(() => {
        toast({ variant: "destructive", description: "Failed to update members." });
      });
  };
  
  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="bg-gray-50">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} placeholder="Trip Name" />
            <DatePicker date={editedDate} onSelect={setEditedDate} />
          </div>
        ) : (
          <CardTitle className="flex justify-between items-center">
            <span>{trip.name || `Trip for ${new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}`}</span>
            <span className="text-sm font-normal text-gray-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}
            </span>
          </CardTitle>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <DragDropContext onDragEnd={handleDrop}>
          <Droppable droppableId={`trip-${trip.id}`}>
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="divide-y" data-testid="winery-list">
                {tripWineries.map((winery, index) => {
                  const nextWinery = tripWineries[index + 1];
                  const hasCoordinates = winery.lat !== undefined && winery.lng !== undefined;
                  const nextHasCoordinates = nextWinery?.lat !== undefined && nextWinery?.lng !== undefined;
                  
                  let distanceText = "";
                  if (hasCoordinates && nextHasCoordinates) {
                    const dist = calculateDistance(
                      { lat: Number(winery.lat), lng: Number(winery.lng) },
                      { lat: Number(nextWinery.lat), lng: Number(nextWinery.lng) }
                    );
                    distanceText = formatDistance(dist);
                  }

                  return (
                    <Draggable key={winery.id} draggableId={winery.id.toString()} index={index}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.draggableProps} className="bg-white">
                          <div className="flex items-start gap-3 p-4 hover:bg-gray-50">
                            <div {...provided.dragHandleProps} className="pt-1">
                              <GripVertical className="w-5 h-5 text-gray-400" />
                            </div>
                            <div className="flex-grow">
                              <p className="font-semibold">{winery.name}</p>
                              <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3"/>{winery.address}</p>
                              <DailyHours openingHours={winery.openingHours} tripDate={new Date(trip.trip_date + 'T00:00:00')} />
                              <WineryNoteEditor
                                wineryDbId={winery.dbId as number}
                                initialNotes={winery.notes || ''}
                                onSave={handleSaveNote}
                              />
                              <WineryReviews visits={winery.visits || []} currentUserId={trip.user_id} members={currentMembers} />
                            </div>
                            {isEditing && (
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveWinery(winery.dbId as number)} className="text-red-500">
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          
                          {/* Distance to next stop */}
                          {distanceText && (
                            <div className="relative h-8 flex items-center px-12 overflow-hidden">
                              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-dashed border-l-2 border-dashed border-gray-300 ml-[1px]"></div>
                              <div className="z-10 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[10px] font-medium text-gray-500 flex items-center gap-1 shadow-sm">
                                <MapPin className="w-2.5 h-2.5" />
                                <span>{distanceText} to next stop</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {isEditing && (
          <div className="p-4 border-t">
            <Popover open={addWineryPopoverOpen} onOpenChange={setAddWineryPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full"><Plus className="w-4 h-4 mr-2"/>Add a Winery</Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search wineries..." value={winerySearch} onValueChange={setWinerySearch} />
                  <CommandList>
                    <CommandEmpty>{isSearching ? "Searching..." : "No wineries found."}</CommandEmpty>
                    <CommandGroup>
                      {searchResults.map(winery => (
                        <CommandItem
                          key={winery.id}
                          value={winery.name} // Add this value prop for filtering
                          onSelect={() => handleAddWinery(winery)}
                        >
                          {winery.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-gray-50 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <div className="flex items-center -space-x-2">
                <TooltipProvider>
                    {currentMembers.map((friend: Friend) => (
                        <Tooltip key={friend.id}>
                            <TooltipTrigger asChild>
                                <Avatar className="h-6 w-6 border-2 border-white">
                                    <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} alt={friend.name} />
                                    <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{friend.name}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>
            </div>
          </div>
          {isEditing && (
              <Popover>
                  <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" disabled={trip.id < 0}><UserPlus className="w-4 h-4 mr-2"/>Add/Remove</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                      <Command>
                          <CommandInput placeholder="Search friends..." className="h-9" />
                          <CommandEmpty>No friends found.</CommandEmpty>
                          <CommandGroup>
                              {friends.map((friend: Friend) => (
                              <CommandItem
                                  key={friend.id}
                                  onSelect={() => onFriendSelect(friend.id)}
                              >
                                  <div className="flex items-center justify-between w-full">
                                      <span>{friend.name}</span>
                                      <Check
                                          className={cn(
                                          "h-4 w-4",
                                          selectedFriends.includes(friend.id) ? "opacity-100" : "opacity-0"
                                          )}
                                      />
                                  </div>
                              </CommandItem>
                              ))}
                          </CommandGroup>
                      </Command>
                  </PopoverContent>
              </Popover>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {isEditing ? (
            <Button onClick={handleSave} className="flex-1 sm:flex-none"><Save className="w-4 h-4 mr-2"/>Save Changes</Button>
          ) : (
            <Button 
                variant="outline" 
                onClick={() => setIsEditing(true)} 
                className="flex-1 sm:flex-none"
                disabled={trip.id < 0}
            >
                {trip.id < 0 ? "Creating..." : <><Edit className="w-4 h-4 mr-2"/>Edit Trip</>}
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={() => handleExportToMaps()} disabled={!trip.wineries || trip.wineries.length === 0}>
                    <Share2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                  <p>Export to Google Maps</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="destructive" size="icon" onClick={() => deleteTrip(trip.id.toString())}><Trash2 className="w-4 h-4"/></Button>
        </div>
      </CardFooter>
    </Card>
  );
});

TripCard.displayName = "TripCard";

export default TripCard;
