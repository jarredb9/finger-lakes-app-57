import { memo, useState, useMemo, useEffect } from "react";
import { Trip, Winery, Friend } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar, Users, MapPin, GripVertical, Trash2, Edit, Save, Plus, X, UserPlus, Check, Share2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { DatePicker } from "./DatePicker";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import DailyHours from "@/components/DailyHours";
import WineryNoteEditor from "./WineryNoteEditor";
import { cn } from "@/lib/utils";

interface TripCardProps {
  trip: Trip;
}

const TripCard = memo(({ trip }: TripCardProps) => {
  const { toast } = useToast();
  const { updateTrip, deleteTrip, updateWineryOrder, toggleWineryOnTrip, removeWineryFromTrip, saveWineryNote, addMembersToTrip } = useTripStore();
  const persistentWineries = useWineryStore(state => state.persistentWineries);
    const { friends, fetchFriends } = useFriendStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(trip.name || "");
  const [editedDate, setEditedDate] = useState<Date | undefined>(new Date(trip.trip_date));
  const [winerySearch, setWinerySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>(trip.members || []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  useEffect(() => {
    // Keep local selected friends in sync with trip data
    setSelectedFriends(trip.members || []);
  }, [trip.members]);

  useEffect(() => {
    if (!winerySearch.trim()) {
      setSearchResults([]);
      return;
    }

    const debounceSearch = setTimeout(() => {
      const search = async () => {
        setIsSearching(true);
        try {
          const response = await fetch(`/api/wineries?query=${encodeURIComponent(winerySearch)}`);
          if (!response.ok) {
            throw new Error('Search failed');
          }
          const results: Winery[] = await response.json();
          // Filter out wineries already in the trip
          const tripWineryIds = new Set((trip.wineries || []).map(w => w.id));
          setSearchResults(results.filter(r => !tripWineryIds.has(r.id)));
        } catch (error) {
          console.error("Winery search failed:", error);
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
  const tripWineries = useMemo(() => {
    return (trip.wineries || []).map(wineryInTrip => {
      const persistentWinery = persistentWineries.find(p => p.id === wineryInTrip.id);
      // Merge data, giving preference to the more complete persistent data
      return persistentWinery ? { ...wineryInTrip, ...persistentWinery } : wineryInTrip;
    });
  }, [trip.wineries, persistentWineries]);

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
      await toggleWineryOnTrip(winery, trip);
      setWinerySearch("");
      setSearchResults([]);
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

  const onFriendSelect = async (friendId: string) => {
    const newSelectedFriends = selectedFriends.includes(friendId)
      ? selectedFriends.filter(id => id !== friendId)
      : [...selectedFriends, friendId];
    
    setSelectedFriends(newSelectedFriends);
    try {
      await addMembersToTrip(trip.id.toString(), newSelectedFriends);
      toast({ description: "Trip members updated." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update members." });
    }
  };
  
  const currentMembers = friends.filter((f: Friend) => trip.members?.includes(f.id));

  const handleExportToMaps = (tripWineries: Winery[]) => {
    if (!tripWineries || tripWineries.length === 0) return;

    const waypoints = tripWineries.map(w => encodeURIComponent(`${w.name}, ${w.address}`));
    let url = 'https://www.google.com/maps/dir/';

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = `${position.coords.latitude},${position.coords.longitude}`;
          const destination = waypoints.pop(); // The last winery is the final destination
          url += `${userLocation}/${waypoints.join('/')}/${destination}`;
          window.open(url, '_blank');
        },
        () => {
          // Geolocation failed, fall back to winery-to-winery directions
          url += waypoints.join('/');
          window.open(url, '_blank');
        }
      );
    } else {
      // Geolocation not supported
      url += waypoints.join('/');
      window.open(url, '_blank');
    }
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
                {tripWineries.map((winery, index) => (
                  <Draggable key={winery.id} draggableId={winery.id.toString()} index={index}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-start gap-3 p-4 bg-white hover:bg-gray-50">
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
                        </div>
                        {isEditing && (
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveWinery(winery.dbId as number)} className="text-red-500">
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {isEditing && (
          <div className="p-4 border-t">
            <Popover>
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
                        <CommandItem key={winery.id} onSelect={() => handleAddWinery(winery)}>
                          <span>{winery.name}</span>
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
      <CardFooter className="bg-gray-50 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-gray-600">
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
          {isEditing && (
              <Popover>
                  <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"><UserPlus className="w-4 h-4 mr-2"/>Add/Remove</Button>
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
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button onClick={handleSave}><Save className="w-4 h-4 mr-2"/>Save Changes</Button>
          ) : (
            <Button variant="outline" onClick={() => setIsEditing(true)}><Edit className="w-4 h-4 mr-2"/>Edit Trip</Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={() => handleExportToMaps(trip.wineries)} disabled={!trip.wineries || trip.wineries.length === 0}>
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
