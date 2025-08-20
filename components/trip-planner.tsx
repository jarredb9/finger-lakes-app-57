"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Winery, Trip } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Edit, Save, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function SortableWineryItem({ winery, onRemove }: { winery: Winery, onRemove: (wineryId: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: winery.dbId! });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
      <div className="flex items-center gap-3">
        <button {...listeners} className="cursor-grab text-gray-400 p-2"><GripVertical size={16} /></button>
        <div>
          <p className="font-medium text-sm">{winery.name}</p>
          <p className="text-xs text-muted-foreground">{winery.address}</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => onRemove(winery.dbId!)}><Trash2 size={16} /></Button>
    </div>
  );
}

function TripCard({ trip, onWineriesUpdate }: { trip: Trip; onWineriesUpdate: () => void; }) {
    const [tripWineries, setTripWineries] = useState<Winery[]>(trip.wineries);
    const [isEditingName, setIsEditingName] = useState(false);
    const [tripName, setTripName] = useState(trip.name || "");
    const { toast } = useToast();
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const handleSaveTripName = async () => {
        if (!trip) return;
        try {
          await fetch(`/api/trips/${trip.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tripName }),
          });
          setIsEditingName(false);
          toast({ description: "Trip name updated." });
          onWineriesUpdate();
        } catch (error) {
          console.error("Failed to save trip name", error);
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
            onWineriesUpdate();
          }
        } catch (error) {
          console.error("Failed to remove winery", error);
        }
    };
    
    const handleDragEnd = async (event: any) => {
        const { active, over } = event;
        if (active.id !== over.id) {
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
        }
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
                        <CardTitle>{trip.name || "Unnamed Trip"}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}><Edit size={16} /></Button>
                      </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {tripWineries.length > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={tripWineries.map(w => w.dbId!)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-3">
                                {tripWineries.map((winery) => (
                                    <SortableWineryItem key={winery.dbId} winery={winery} onRemove={handleRemoveWinery} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                ) : (
                    <p className="text-muted-foreground text-center py-4">This trip has no wineries yet.</p>
                )}
            </CardContent>
        </Card>
    );
}


export default function TripPlanner({ initialDate }: { initialDate: Date }) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [trips, setTrips] = useState<Trip[]>([]);
  const { toast } = useToast();

  const fetchTripsForDate = useCallback(async (date: Date) => {
    const dateString = date.toISOString().split("T")[0];
    try {
      const response = await fetch(`/api/trips?date=${dateString}`);
      if (response.ok) {
        const data = await response.json();
        setTrips(Array.isArray(data) ? data : (data ? [data] : []));
      } else {
        setTrips([]);
      }
    } catch (error) {
      console.error("Failed to fetch trips", error);
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
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Trips for {selectedDate ? selectedDate.toLocaleDateString() : '...'}</h2>
            <Button onClick={handleCreateTrip}><PlusCircle className="mr-2 h-4 w-4" /> Create New Trip</Button>
        </div>

        {trips.length > 0 ? (
            trips.map(trip => (
                <TripCard key={trip.id} trip={trip} onWineriesUpdate={() => fetchTripsForDate(selectedDate!)} />
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