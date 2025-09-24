'use client';

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Winery, Trip, Visit, Friend } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Edit, Save, PlusCircle, Star, UserPlus, XCircle, Info, Users, Clock, Calendar as CalendarIcon, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from '@/utils/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTripStore } from "@/lib/stores/tripStore";

interface TripWinery {
    trip_id: number;
    winery_id: number;
    visit_order: number;
    notes: string;
}

function SortableWineryItem({ trip, winery, onRemove, onNoteSave, userId }: { trip: Trip; winery: Winery; onRemove: (wineryId: number) => void; onNoteSave: (wineryId: number, notes: string) => void; userId: string; }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: winery.dbId! });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const [notes, setNotes] = useState(winery.notes || "");
    const [isSavingNote, setIsSavingNote] = useState(false);
    const isPastTrip = new Date(trip.trip_date + 'T00:00:00') < new Date();
    const { toast } = useToast();

    const handleSaveNote = async () => {
        setIsSavingNote(true);
        try {
            await onNoteSave(winery.dbId!, notes);
            toast({ description: "Note saved." });
        } catch (error) {
            toast({ variant: "destructive", description: "Failed to save note." });
        } finally {
            setIsSavingNote(false);
        }
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="p-3 bg-white rounded-lg shadow-sm space-y-3">
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <button {...listeners} className="cursor-grab touch-none text-gray-400 p-2 pt-1"><GripVertical size={16} /></button>
                    <div>
                        <p className="font-medium text-sm">{winery.name}</p>
                        <p className="text-xs text-muted-foreground">{winery.address}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => onRemove(winery.dbId!)}><Trash2 size={16} /></Button>
            </div>
            
            {isPastTrip ? (
                winery.visits && winery.visits.length > 0 ? (
                    <div className="pl-12 space-y-3">
                        {winery.visits.map((visit: Visit) => (
                            <div key={visit.id} className="space-y-1">
                                <p className="font-semibold text-xs text-gray-600">
                                    {visit.user_id === userId ? "Your Review:" : `${visit.profiles?.name || 'A friend'}'s Review:`}
                                </p>
                                <div className="flex items-center">
                                    {[...Array(5)].map((_, i) => (<Star key={i} className={`w-4 h-4 ${i < (visit.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />))}
                                </div>
                                {visit.user_review && (
                                    <p className="text-sm text-gray-700 italic bg-gray-50 p-2 rounded">"{visit.user_review}"</p>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="pl-12 text-xs text-muted-foreground">No reviews logged for this visit.</p>
                )
            ) : (
                <div className="pl-12 space-y-2">
                    <Textarea placeholder="Add notes for your visit (e.g., Reservation at 2pm)..." value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm bg-gray-50" />
                    <Button size="sm" onClick={handleSaveNote} disabled={isSavingNote}>
                        {isSavingNote ? "Saving..." : "Save Note"}
                    </Button>
                </div>
            )}
        </div>
    );
}

export default function TripCard({ tripId, userId }: { tripId: string; userId: string; }) {
    const { trips, fetchTripsForDate, deleteTrip, updateTrip, updateWineryOrder, removeWineryFromTrip, saveWineryNote, addMembersToTrip } = useTripStore();
    const trip = trips.find(t => t.id == tripId);

    const [tripWineries, setTripWineries] = useState<Winery[]>([]);
    const [isEditingName, setIsEditingName] = useState(false);
    const [tripName, setTripName] = useState("");
    const [friends, setFriends] = useState<Friend[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const { toast } = useToast();
    
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    
    const supabase = createClient();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
              delay: 250,
              tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, { 
            coordinateGetter: sortableKeyboardCoordinates 
        })
    );

    useEffect(() => {
        if (!trip) return;

        setTripWineries(trip.wineries || []);
        setTripName(trip.name || "");
        setSelectedFriends(trip.members || []);
        setSelectedDate(new Date(trip.trip_date));

        const fetchFriends = async () => {
            const response = await fetch('/api/friends');
            if (response.ok) {
                const data = await response.json();
                setFriends(data.friends || []);
            }
        };
        fetchFriends();
    }, [trip, fetchTripsForDate]);

    useEffect(() => {
        if (!trip) return;

        const channel = supabase.channel(`trip-updates-${trip.id}`);
        
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` }, (payload: RealtimePostgresChangesPayload<Trip>) => {
              if (payload.new && selectedDate) {
                  fetchTripsForDate(selectedDate);
              }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_wineries', filter: `trip_id=eq.${trip.id}` }, (payload: RealtimePostgresChangesPayload<TripWinery>) => {
              if (selectedDate) fetchTripsForDate(selectedDate);
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
    }, [trip?.id, supabase, fetchTripsForDate, selectedDate]);

    if (!trip) {
        return null; // Or a loading spinner
    }

    const handleSaveTripName = async () => {
        if (!trip || !tripName) return;

        const originalName = trip.name;
        useTripStore.setState(state => ({
            trips: state.trips.map(t => t.id === trip.id ? { ...t, name: tripName } : t)
        }));
        setIsEditingName(false);

        try {
          await updateTrip(trip.id, { name: tripName });
          toast({ description: "Trip name updated." });
        } catch (error) {
          toast({ variant: "destructive", description: "Failed to save trip name." });
          useTripStore.setState(state => ({
            trips: state.trips.map(t => t.id === trip.id ? { ...t, name: originalName } : t)
          }));
        }
    };
    
    const handleSaveTripDate = async (newDate: Date) => {
        const newDateString = newDate.toISOString().split('T')[0];
        if (!trip || !newDateString) return;

        const originalDate = new Date(trip.trip_date);
        useTripStore.setState(state => ({
            trips: state.trips.filter(t => t.id !== trip.id)
        }));

        try {
            await updateTrip(trip.id, { trip_date: newDateString });
            toast({ description: "Trip date updated." });
        } catch (error) {
            toast({ variant: "destructive", description: "Failed to save trip date." });
            if (selectedDate && new Date(selectedDate).toDateString() === originalDate.toDateString()) {
                fetchTripsForDate(originalDate);
            }
        }
    };

    const handleRemoveWinery = async (wineryId: number) => {
        if (!trip) return;
        try {
          await removeWineryFromTrip(trip.id, wineryId);
          toast({ description: "Winery removed from trip." });
        } catch (error) {
          toast({ variant: "destructive", description: "Failed to remove winery." });
        }
    };
    
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            const oldIndex = tripWineries.findIndex((item) => item.dbId === active.id);
            const newIndex = tripWineries.findIndex((item) => item.dbId === over.id);
            const newOrder = arrayMove(tripWineries, oldIndex, newIndex);
            
            setTripWineries(newOrder);
            
            try {
                await updateWineryOrder(trip.id, newOrder.map(w => w.dbId!));
            } catch (error) {
                toast({ variant: "destructive", description: "Failed to update winery order." });
                setTripWineries(tripWineries);
            }
        }
    };

    const handleDeleteTrip = async () => {
        try {
            await deleteTrip(trip.id);
            toast({ description: "Trip deleted successfully." });
        } catch (error) {
            toast({ variant: 'destructive', description: "Failed to delete trip." });
        }
    };

     const handleNoteSave = async (wineryId: number, notes: string) => {
        try {
            await saveWineryNote(trip.id, wineryId, notes);
        } catch (error) {
            toast({ variant: "destructive", description: "Failed to save note." });
            throw error;
        }
    };
    
    const handleAddFriendsToTrip = async () => {
        try {
            await addMembersToTrip(trip.id, selectedFriends);
            toast({ description: "Trip members updated." });
        } catch (error) {
            toast({ variant: "destructive", description: "Failed to update trip members." });
        }
    };

    const currentMembers = friends.filter((f: Friend) => selectedFriends.includes(f.id));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPastTrip = new Date(trip.trip_date + 'T00:00:00') < today;
    
    const handleExportToMaps = () => {
        if (!tripWineries || tripWineries.length === 0) {
            return;
        }

        const encodedWineries = tripWineries.map(w => encodeURIComponent(`${w.name}, ${w.address}`));
        
        let url = `https://www.google.com/maps/dir/Current+Location/`;

        if (encodedWineries.length === 1) {
            url += `${encodedWineries[0]}`;
        } else {
            const waypoints = encodedWineries.join('/');
            url += `${waypoints}`;
        }
        
        window.open(url, '_blank');
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    {isEditingName ? (
                      <div className="flex items-center gap-2 flex-grow">
                        <Input value={tripName} onChange={(e) => setTripName(e.target.value)} />
                        <Button size="icon" onClick={handleSaveTripName}><Save size={16} /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg md:text-xl">{trip.name || "Unnamed Trip"}</CardTitle>
                        {<Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}><Edit size={16} /></Button>}
                      </div>
                    )}
                     <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon" variant="outline" onClick={handleExportToMaps} disabled={!tripWineries || tripWineries.length === 0}>
                                    <Share2 size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Export to Google Maps</p>
                            </TooltipContent>
                        </Tooltip>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon"><UserPlus size={16} /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0">
                            <Command>
                              <CommandInput placeholder="Search friends..." className="h-9" />
                              <CommandEmpty>No friends found.</CommandEmpty>
                              <CommandGroup>
                                {friends.map((friend: Friend) => (
                                  <CommandItem
                                    key={friend.id}
                                    onSelect={() => {
                                      const newSelection = selectedFriends.includes(friend.id)
                                        ? selectedFriends.filter(id => id !== friend.id)
                                        : [...selectedFriends, friend.id];
                                      setSelectedFriends(newSelection);
                                    }}
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
                            <Button className="w-full" onClick={handleAddFriendsToTrip}>Update Members</Button>
                          </PopoverContent>
                        </Popover>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon"><Trash2 size={16} /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently delete this trip and all its wineries. This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteTrip}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                     </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <CalendarIcon size={16} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</p>
                        {!isPastTrip && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon"><Edit size={16} /></Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={(newDate) => {
                                            if (newDate) {
                                                handleSaveTripDate(newDate);
                                            }
                                        }}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>
                {currentMembers.length > 0 && (
                    <div className="flex items-center space-x-2 mt-2">
                        <Users size={16} className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Collaborators:</span>
                        <div className="flex items-center -space-x-2">
                             {currentMembers.map((friend: Friend) => (
                                  <div key={friend.id} className="relative z-0">
                                      <Avatar className="h-6 w-6 border-2 border-white">
                                        <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} alt={friend.name} />
                                        <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                  </div>
                              ))}
                        </div>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                {tripWineries.length > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={tripWineries.map(w => w.dbId!)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-3">
                                {tripWineries.map((winery) => (
                                    <SortableWineryItem key={winery.dbId} trip={trip} winery={winery} onRemove={handleRemoveWinery} onNoteSave={handleNoteSave} userId={userId} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                ) : (
                    <p className="text-muted-foreground text-center py-4">This trip has no wineries yet. Add wineries from the map.</p>
                )}
            </CardContent>
        </Card>
    );
}
