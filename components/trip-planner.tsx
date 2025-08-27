// file: components/trip-planner.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Winery, Trip, Visit } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Edit, Save, PlusCircle, Star, UserPlus, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from '@/utils/supabase/client';
import { Badge } from "@/components/ui/badge";

// This is the updated SortableWineryItem component
function SortableWineryItem({ trip, winery, onRemove, onNoteSave, userId }: { trip: Trip; winery: Winery; onRemove: (wineryId: number) => void; onNoteSave: (wineryId: number, notes: string) => void; userId: string; }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: winery.dbId! });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [notes, setNotes] = useState((winery as any).notes || "");
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
                    {winery.visits.map((visit: any) => (
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

// Updated TripCard component with Realtime and UI enhancements
function TripCard({ trip, onTripDeleted, onWineriesUpdate, userId }: { trip: Trip; onTripDeleted: () => void; onWineriesUpdate: () => void; userId: string; }) {
    const [tripWineries, setTripWineries] = useState<Winery[]>(trip.wineries);
    const [isEditingName, setIsEditingName] = useState(false);
    const [tripName, setTripName] = useState(trip.name || "");
    const [friends, setFriends] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>(trip.members || []);
    const { toast } = useToast();
    
    // Setup Supabase Realtime
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

    // Subscribe to real-time updates for this specific trip
    useEffect(() => {
        const channel = supabase.channel(`trip-updates-${trip.id}`);
        
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` }, (payload: any) => {
              console.log('Realtime update received:', payload);
              if (payload.new) {
                  setTripName(payload.new.name || "");
                  setSelectedFriends(payload.new.members || []);
              }
              onWineriesUpdate();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_wineries', filter: `trip_id=eq.${trip.id}` }, (payload: any) => {
              console.log('Winery update received:', payload);
              onWineriesUpdate();
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
    }, [trip.id, onWineriesUpdate, supabase]);

    useEffect(() => {
        setTripWineries(trip.wineries);
        setTripName(trip.name || "");
        setSelectedFriends(trip.members || []);

        const fetchFriends = async () => {
            const response = await fetch('/api/friends');
            if (response.ok) {
                const data = await response.json();
                setFriends(data.friends || []);
            }
        };
        fetchFriends();
    }, [trip]);

    const handleSaveTripName = async () => {
        if (!trip) return;
        try {
          const response = await fetch(`/api/trips/${trip.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tripName }),
          });
          if (response.ok) {
            setIsEditingName(false);
            toast({ description: "Trip name updated." });
            // The onWineriesUpdate call is now handled by the real-time listener
          }
        } catch (error) {
          console.error("Failed to save trip name", error);
          toast({ variant: "destructive", description: "Failed to save trip name." });
        }
    };

    const handleRemoveWinery = async (wineryId: number) => {
        if (!trip) return;
        try {
          const response = await fetch(`/api/trips/${trip.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeWineryId: wineryId }),
          });
          if (response.ok) {
            toast({ description: "Winery removed from trip." });
            // The onWineriesUpdate call is now handled by the real-time listener
          }
        } catch (error) {
          console.error("Failed to remove winery", error);
          toast({ variant: "destructive", description: "Failed to remove winery." });
        }
    };
    
    const handleDragEnd = async (event: any) => {
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
          const oldIndex = tripWineries.findIndex((item) => item.dbId === active.id);
          const newIndex = tripWineries.findIndex((item) => item.dbId === over.id);
          const newOrder = arrayMove(tripWineries, oldIndex, newIndex);
          setTripWineries(newOrder);
          updateWineryOrder(newOrder.map(w => w.dbId!));
        }
    };

    const updateWineryOrder = async (wineryIds: number[]) => {
        if (!trip) return;
        try {
            await fetch(`/api/trips/${trip.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wineryOrder: wineryIds }),
          });
        } catch (error) {
          console.error("Failed to update winery order", error);
          toast({ variant: "destructive", description: "Failed to update winery order." });
        }
    };

    const handleDeleteTrip = async () => {
        try {
            const response = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
            if (response.ok) {
                toast({ description: "Trip deleted successfully." });
                onTripDeleted();
            } else {
                toast({ variant: 'destructive', description: "Failed to delete trip." });
            }
        } catch (error) {
            console.error("Failed to delete trip", error);
        }
    };

     const handleNoteSave = async (wineryId: number, notes: string) => {
        try {
            await fetch(`/api/trips/${trip.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updateNote: { wineryId, notes } }),
            });
            // The onWineriesUpdate call is now handled by the real-time listener
        } catch (error) {
            console.error("Failed to save note", error);
            toast({ variant: "destructive", description: "Failed to save note." });
            throw error;
        }
    };
    
    const handleAddFriendsToTrip = async () => {
        try {
            const response = await fetch(`/api/trips/${trip.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ members: selectedFriends }),
            });
            if (response.ok) {
                toast({ description: "Trip members updated." });
                // The onWineriesUpdate call is now handled by the real-time listener
            }
        } catch (error) {
            console.error("Failed to add friends to trip", error);
            toast({ variant: "destructive", description: "Failed to update trip members." });
        }
    };

    // New logic to display current members
    const currentMembers = friends.filter((f: any) => selectedFriends.includes(f.id));

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
                        <Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}><Edit size={16} /></Button>
                      </div>
                    )}
                     <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon"><UserPlus size={16} /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0">
                            <Command>
                              <CommandInput placeholder="Search friends..." className="h-9" />
                              <CommandEmpty>No friends found.</CommandEmpty>
                              <CommandGroup>
                                {friends.map((friend: any) => (
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
                {/* Display collaborators */}
                {currentMembers.length > 0 && (
                    <div className="flex items-center space-x-2 mt-2">
                        <Users size={16} className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Collaborators:</span>
                        <div className="flex items-center -space-x-2">
                             {currentMembers.map((friend: any) => (
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

export default function TripPlanner({ initialDate, user }: { initialDate: Date, user: any }) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [trips, setTrips] = useState<Trip[]>([]);
  const { toast } = useToast();

  const fetchTripsForDate = useCallback(async (date: Date) => {
    const dateString = date.toISOString().split("T")[0];
    try {
      const response = await fetch(`/api/trips?date=${dateString}`);
      if (response.ok) {
        const data = await response.json();
        setTrips(Array.isArray(data) ? data : []);
      } else {
        setTrips([]);
      }
    } catch (error) {
      console.error("Failed to fetch trips", error);
      setTrips([]);
    }
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchTripsForDate(selectedDate);
    }
  }, [selectedDate, fetchTripsForDate]);

  const handleCreateTrip = async () => {
    if (!selectedDate) return;
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate.toISOString().split('T')[0], name: "New Trip" })
      });
      if (response.ok) {
        toast({ title: "Success", description: "New trip created." });
        fetchTripsForDate(selectedDate);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Could not create new trip." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not create trip." });
    }
  };


  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Select a Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
            />
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-2xl font-bold">Trips for {selectedDate ? selectedDate.toLocaleDateString() : '...'}</h2>
            <Button onClick={handleCreateTrip}><PlusCircle className="mr-2 h-4 w-4" /> Create New Trip</Button>
        </div>

        {trips.length > 0 ? (
            trips.map(trip => (
                <TripCard 
                    key={trip.id} 
                    trip={trip} 
                    onTripDeleted={() => fetchTripsForDate(selectedDate!)}
                    onWineriesUpdate={() => fetchTripsForDate(selectedDate!)} 
                    userId={user.id}
                />
            ))
        ) : (
            <Card>
                <CardContent className="text-center py-12">
                    <p className="text-muted-foreground">No trips planned for this day.</p>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}