"use client";

import { memo, useState, useEffect } from "react";
import { Trip, Winery, Visit, TripMember } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar, Users, MapPin, GripVertical, Trash2, Edit, Save, Plus, X, UserPlus, Share2, Star, Wine } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { DatePicker } from "./DatePicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import DailyHours from "@/components/DailyHours";
import { calculateDistance, formatDistance } from "@/lib/utils/geo";

interface TripCardProps {
  trip: Trip;
  isOwner: boolean;
  canEdit: boolean;
  currentMembers: TripMember[];
  onUpdateTrip: (id: string, updates: { name?: string; trip_date?: string }) => Promise<void>;
  onDeleteTrip: (id: string) => Promise<void>;
  onUpdateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  onToggleWineryOnTrip: (winery: Winery, trip: Trip) => void;
  onRemoveWineryFromTrip: (tripId: string, wineryDbId: number) => Promise<void>;
  onSaveWineryNote: (wineryId: number, newNotes: string) => Promise<void>;
  onOpenShareDialog: (id: string, name: string) => void;
  onOpenWineryNoteEditor: (wineryDbId: number, notes: string, onSave: (id: number, notes: string) => Promise<void>) => void;
  onExportToMaps: () => void;
}

const WineryReviews = ({ visits, currentUserId, members }: { visits: Visit[], currentUserId: string, members: TripMember[] }) => {
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

const TripCard = memo(({ 
  trip, 
  isOwner, 
  canEdit, 
  currentMembers,
  onUpdateTrip,
  onDeleteTrip,
  onUpdateWineryOrder,
  onToggleWineryOnTrip,
  onRemoveWineryFromTrip,
  onSaveWineryNote,
  onOpenShareDialog,
  onOpenWineryNoteEditor,
  onExportToMaps
}: TripCardProps) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(trip?.name || "");
  const [editedDate, setEditedDate] = useState<Date | undefined>(() => {
    try {
      if (!trip?.trip_date) return undefined;
      return new Date(trip.trip_date + 'T00:00:00');
    } catch (e) {
      return undefined;
    }
  });
  const [winerySearch, setWinerySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addWineryPopoverOpen, setAddWineryPopoverOpen] = useState(false);

  useEffect(() => {
    if (!winerySearch.trim() || !trip?.wineries) {
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
          const tripWineryIds = new Set((trip.wineries || []).map(w => w.id));
          const finalResults = results.filter(r => !tripWineryIds.has(r.id));
          setSearchResults(finalResults);
        } catch (error) {
          // Note: Toast should be handled by the parent container or passed as a prop
          // But for now, we'll just log or omit since we want to be presentational
        } finally {
          setIsSearching(false);
        }
      };
      search();
    }, 500);

    return () => clearTimeout(debounceSearch);
  }, [winerySearch, trip?.wineries]);

  if (!trip || !trip.trip_date) {
    return null;
  }

  const tripWineries = trip.wineries || [];

  const handleDrop = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(tripWineries);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    const newWineryIds = items.map(item => item.dbId as number);
    onUpdateWineryOrder(trip.id.toString(), newWineryIds);
  };

  const handleSave = async () => {
    if (!editedDate) return;
    try {
      await onUpdateTrip(trip.id.toString(), { 
        name: editedName, 
        trip_date: editedDate.toISOString().split('T')[0] 
      });
      setIsEditing(false);
    } catch (error) {
      // Error handling by parent
    }
  };

  const handleAddWinery = (winery: Winery) => {
    onToggleWineryOnTrip(winery, trip);
    setWinerySearch("");
    setSearchResults([]);
    setAddWineryPopoverOpen(false);
  };

  const getSafeDateString = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return "Invalid Date";
      return d.toLocaleDateString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  return (
    <Card className="w-full overflow-hidden" data-testid="trip-details-card">
      <CardHeader className="bg-gray-50 border-b">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            {isEditing ? (
              <Input 
                value={editedName} 
                onChange={(e) => setEditedName(e.target.value)} 
                placeholder="Trip Name" 
                className="text-xl font-bold h-9"
              />
            ) : (
              <CardTitle className="text-xl md:text-2xl font-bold">
                {trip.name || `Trip for ${getSafeDateString(trip.trip_date)}`}
              </CardTitle>
            )}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {isEditing ? (
                  <DatePicker date={editedDate} onSelect={setEditedDate} />
                ) : (
                  getSafeDateString(trip.trip_date)
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Wine className="w-4 h-4" />
                {tripWineries.length} {tripWineries.length === 1 ? 'Winery' : 'Wineries'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center -space-x-2 mr-1">
              <TooltipProvider>
                {(currentMembers || []).map((member: TripMember) => (
                  <Tooltip key={member.id || `member-${Math.random()}`}>
                    <TooltipTrigger asChild>
                      <Avatar className="h-8 w-8 border-2 border-white shadow-sm hover:z-10 transition-all">
                        <AvatarImage src={`https://i.pravatar.cc/150?u=${member.email || 'unknown'}`} alt={member.name || 'User'} />
                        <AvatarFallback>{(member.name || 'U').charAt(0)}</AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{member.name || 'Unknown User'} ({member.role || 'Member'})</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8 rounded-full border-dashed bg-gray-50 hover:bg-white"
                      onClick={() => onOpenShareDialog(trip.id.toString(), trip.name || "Trip")}
                      disabled={trip.id < 0}
                      aria-label="Share Trip"
                    >
                      <UserPlus className="h-4 w-4 text-gray-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Manage Members</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="h-8 w-px bg-gray-200 mx-1 hidden md:block" />

            <div className="flex items-center gap-2">
              {isEditing ? (
                <Button size="sm" onClick={handleSave} className="h-9"><Save className="w-4 h-4 mr-2"/>Save</Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsEditing(true)} 
                  className="h-9"
                  disabled={trip.id < 0 || !canEdit}
                  aria-label="Edit Trip"
                >
                  {trip.id < 0 ? "Creating..." : <><Edit className="w-4 h-4 mr-2"/>Edit</>}
                </Button>
              )}
              {isOwner && (
                <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => onDeleteTrip(trip.id.toString()).catch(() => {})} aria-label="Delete Trip">
                  <Trash2 className="w-4 h-4"/>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!mounted ? (
          <div className="divide-y" data-testid="winery-list-loading">
            {tripWineries.map((winery) => (
              <div key={winery.id || `loading-${Math.random()}`} className="bg-white">
                <div className="flex items-start gap-3 p-4">
                  <div className="pt-1">
                    <GripVertical className="w-5 h-5 text-gray-200" />
                  </div>
                  <div className="grow">
                    <p className="font-semibold">{winery.name}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3"/>{winery.address}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDrop}>
            <Droppable droppableId={`trip-${trip.id}`}>
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="divide-y" data-testid="winery-list">
                  {(tripWineries || []).map((winery, index) => {
                    const nextWinery = tripWineries[index + 1];
                    const hasCoordinates = winery.lat !== undefined && winery.lng !== undefined && winery.lat !== null && winery.lng !== null;
                    const nextHasCoordinates = nextWinery?.lat !== undefined && nextWinery?.lng !== undefined && nextWinery?.lat !== null && nextWinery?.lng !== null;
                    
                    let distanceText = "";
                    if (hasCoordinates && nextHasCoordinates) {
                      try {
                        const dist = calculateDistance(
                          { lat: Number(winery.lat), lng: Number(winery.lng) },
                          { lat: Number(nextWinery.lat), lng: Number(nextWinery.lng) }
                        );
                        distanceText = formatDistance(dist);
                      } catch (e) {
                        // Silent fail for distance calculation in UI
                      }
                    }

                    return (
                      <Draggable key={winery.id} draggableId={winery.id.toString()} index={index}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} className="bg-white">
                            <div className="flex items-start gap-3 p-4 hover:bg-gray-50">
                              <div {...provided.dragHandleProps} className="pt-1">
                                <GripVertical className="w-5 h-5 text-gray-400" />
                              </div>
                              <div className="grow">
                                <p className="font-semibold">{winery.name}</p>
                                <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3"/>{winery.address}</p>
                                <DailyHours openingHours={winery.openingHours} tripDate={new Date(trip.trip_date + 'T00:00:00')} />
                                
                                <div className="mt-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => onOpenWineryNoteEditor(winery.dbId as number, winery.notes || '', onSaveWineryNote)}
                                  >
                                    {winery.notes ? "Edit Notes" : "Add Notes"}
                                  </Button>
                                  {winery.notes && (
                                    <p className="text-xs text-slate-600 mt-1 pl-2 italic border-l-2 border-slate-200">
                                      {winery.notes}
                                    </p>
                                  )}
                                </div>

                                <WineryReviews visits={winery.visits || []} currentUserId={trip.user_id} members={currentMembers} />
                              </div>
                              {isEditing && (
                                <Button variant="ghost" size="icon" onClick={() => onRemoveWineryFromTrip(trip.id.toString(), winery.dbId as number)} className="text-red-500">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            
                            {distanceText && (
                              <div className="relative h-8 flex items-center px-12 overflow-hidden">
                                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-dashed border-l-2 border-dashed border-gray-300 ml-px"></div>
                                <div className="z-10 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[10px] font-medium text-gray-500 flex items-center gap-1 shadow-xs">
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
        )}
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
                          value={winery.name}
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
      <CardFooter className="bg-gray-50 p-3 border-t flex justify-between items-center">
        <div className="flex items-center gap-2">
          {isOwner && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={() => onOpenShareDialog(trip.id.toString(), trip.name || "Trip")}
                    disabled={trip.id < 0}
                    data-testid="share-trip-btn"
                  >
                    <Users size={14} className="mr-1.5" />
                    Collaborate
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Invite friends to this trip</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 px-2 text-xs"
                  onClick={() => onExportToMaps()} 
                  disabled={!tripWineries || tripWineries.length === 0}
                >
                  <Share2 size={14} className="mr-1.5" />
                  Maps Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                  <p>Open in Google Maps</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider" data-testid="trip-id-display">
           ID: {trip.id > 0 ? trip.id : 'Pending'}
        </div>
      </CardFooter>
    </Card>
  );
});
TripCard.displayName = "TripCard";

export default TripCard;
