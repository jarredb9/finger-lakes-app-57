import { memo, useState, useMemo, useEffect } from "react";
import { Trip, Winery, Friend } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar, Users, MapPin, GripVertical, Trash2, Edit, Save, Plus, X, UserPlus, Check } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { DatePicker } from "./DatePicker";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TripCardProps {
  trip: Trip;
  allWineries: Winery[];
}

const TripCard = memo(({ trip, allWineries }: TripCardProps) => {
  const { toast } = useToast();
  const { updateTrip, deleteTrip, updateWineryOrder, toggleWineryOnTrip, removeWineryFromTrip, saveWineryNote, addMembersToTrip } = useTripStore();
  const { friends, fetchFriends } = useFriendStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(trip.name || "");
  const [editedDate, setEditedDate] = useState<Date | undefined>(new Date(trip.trip_date));
  const [winerySearch, setWinerySearch] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [selectedFriends, setSelectedFriends] = useState<string[]>(trip.members || []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const availableWineries = useMemo(() => 
    allWineries.filter(w => !trip.wineries.some(tw => tw.id === w.id)),
    [allWineries, trip.wineries]
  );

  const handleDrop = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(trip.wineries);
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
      toast({ description: `${winery.name} added to trip.` });
    } catch (error) {
      toast({ variant: "destructive", description: `Failed to add ${winery.name}.` });
    }
  };

  const handleRemoveWinery = async (wineryId: string) => {
    try {
      await removeWineryFromTrip(trip.id.toString(), Number(wineryId));
      toast({ description: "Winery removed from trip." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to remove winery." });
    }
  };

  const handleNotesChange = (wineryId: number, newNotes: string) => {
    setNotes(prev => ({ ...prev, [wineryId]: newNotes }));
  };

  const handleSaveNotes = async (wineryId: number) => {
    try {
      await saveWineryNote(trip.id.toString(), wineryId, notes[wineryId] || "");
      toast({ description: "Notes saved." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to save notes." });
    }
  };

  const handleAddMembers = async () => {
    try {
      await addMembersToTrip(trip.id.toString(), selectedFriends);
      toast({ description: "Members added to trip." });
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to add members." });
    }
  };

  const onFriendSelect = (friendId: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId) 
        : [...prev, friendId]
    );
  };
  
  const currentMembers = friends.filter((f: Friend) => trip.members?.includes(f.id));

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
              <div {...provided.droppableProps} ref={provided.innerRef} className="divide-y">
                {trip.wineries.map((winery, index) => (
                  <Draggable key={winery.id} draggableId={winery.id.toString()} index={index}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="flex items-start gap-3 p-4 bg-white hover:bg-gray-50">
                        <GripVertical className="w-5 h-5 text-gray-400 mt-1" />
                        <div className="flex-grow">
                          <p className="font-semibold">{winery.name}</p>
                          <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3"/>{winery.address}</p>
                          <Textarea 
                            placeholder="Add notes..."
                            value={notes[Number(winery.id)] ?? winery.notes ?? ''}
                            onChange={(e) => handleNotesChange(Number(winery.id), e.target.value)}
                            onBlur={() => handleSaveNotes(Number(winery.id))}
                            className="mt-2 text-sm"
                          />
                        </div>
                        {isEditing && (
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveWinery(winery.id)} className="text-red-500">
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
                    <CommandEmpty>No wineries found.</CommandEmpty>
                    <CommandGroup>
                      {availableWineries.map(winery => (
                        <CommandItem key={winery.id} onSelect={() => handleAddWinery(winery)}>
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
                        <Button className="w-full" onClick={handleAddMembers}>Update Members</Button>
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
          <Button variant="destructive" size="icon" onClick={() => deleteTrip(trip.id.toString())}><Trash2 className="w-4 h-4"/></Button>
        </div>
      </CardFooter>
    </Card>
  );
});

TripCard.displayName = "TripCard";

export default TripCard;
