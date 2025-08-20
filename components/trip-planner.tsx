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
import { GripVertical, Map, Trash2, Edit, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function SortableWineryItem({ winery, onRemove }: { winery: Winery, onRemove: (wineryId: number) => void }) {
  console.log("SortableWineryItem rendered for winery:", winery.name);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: winery.dbId! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
      <div className="flex items-center gap-3">
        <button {...listeners} className="cursor-grab text-gray-400 p-2">
            <GripVertical size={16} />
        </button>
        <div>
          <p className="font-medium text-sm">{winery.name}</p>
          <p className="text-xs text-muted-foreground">{winery.address}</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => onRemove(winery.dbId!)}>
        <Trash2 size={16} />
      </Button>
    </div>
  );
}

export default function TripPlanner() {
  console.log("TripPlanner component rendered");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripWineries, setTripWineries] = useState<Winery[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tripName, setTripName] = useState("");
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchTrip = useCallback(async (date: Date) => {
    const dateString = date.toISOString().split("T")[0];
    console.log(`Fetching trip for date: ${dateString}`);
    try {
      const response = await fetch(`/api/trips?date=${dateString}`);
      if (response.ok) {
        const data = await response.json();
        console.log("Trip data fetched successfully:", data);
        setTrip(data);
        setTripName(data ? data.name : "");
        setTripWineries(data ? data.wineries : []);
      } else {
        console.log("No trip found for this date.");
        setTrip(null);
        setTripName("");
        setTripWineries([]);
      }
    } catch (error) {
      console.error("Failed to fetch trip", error);
    }
  }, []);

  useEffect(() => {
    if (selectedDate) {
      console.log("Selected date changed:", selectedDate);
      fetchTrip(selectedDate);
    }
  }, [selectedDate, fetchTrip]);

  const handleCreateTrip = async () => {
    if (!selectedDate) return;
    console.log("Creating trip for date:", selectedDate);
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate.toISOString().split('T')[0] })
      });
      if (response.ok) {
        toast({ title: "Success", description: "Trip created. You can now add wineries." });
        fetchTrip(selectedDate);
      }
    } catch (error) {
      console.error("Failed to create trip", error);
      toast({ variant: "destructive", title: "Error", description: "Could not create trip." });
    }
  };

  const handleSaveTripName = async () => {
    if (!trip) return;
    console.log(`Saving new name "${tripName}" for trip ID: ${trip.id}`);
    try {
      await fetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tripName }),
      });
      setIsEditingName(false);
      setTrip(prev => prev ? { ...prev, name: tripName } : null);
      toast({ description: "Trip name updated." });
    } catch (error) {
      console.error("Failed to save trip name", error);
    }
  };

  const handleRemoveWinery = async (wineryId: number) => {
    if (!trip) return;
    console.log(`Attempting to remove winery with ID: ${wineryId} from trip ID: ${trip.id}`);
    try {
      const response = await fetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeWineryId: wineryId }),
      });
      if (response.ok) {
        console.log("Winery removed successfully. Refetching trip.");
        fetchTrip(selectedDate!);
      } else {
        console.error("Failed to remove winery from trip");
      }
    } catch (error) {
      console.error("Failed to remove winery", error);
    }
  };
  
  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over) return;
    console.log("Drag ended:", { active, over });
    if (active.id !== over.id) {
      setTripWineries((items) => {
        const oldIndex = items.findIndex((item) => item.dbId === active.id);
        const newIndex = items.findIndex((item) => item.dbId === over.id);
        if (oldIndex === -1 || newIndex === -1) return items;
        const newOrder = arrayMove(items, oldIndex, newIndex);
        console.log("New winery order:", newOrder);
        updateWineryOrder(newOrder.map(w => w.dbId!));
        return newOrder;
      });
    }
  };

  const updateWineryOrder = async (wineryIds: number[]) => {
    if (!trip) return;
    console.log(`Updating winery order for trip ID: ${trip.id} with order:`, wineryIds);
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
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Itinerary for {selectedDate ? selectedDate.toLocaleDateString() : "..."}
            </CardTitle>
            {trip ? (
              <div className="flex items-center gap-2 mt-2">
                {isEditingName ? (
                  <>
                    <Input value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder="Enter trip name" />
                    <Button size="icon" onClick={handleSaveTripName}><Save size={16} /></Button>
                  </>
                ) : (
                  <>
                    <CardDescription>{trip.name || "Unnamed Trip"}</CardDescription>
                    <Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}><Edit size={16} /></Button>
                  </>
                )}
              </div>
            ) : (
              <CardDescription>No trip planned for this day.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!trip ? (
                <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">Create a new trip for this day.</p>
                    <Button onClick={handleCreateTrip}>Create Trip</Button>
                </div>
            ) : tripWineries.length > 0 ? (
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
              <p className="text-muted-foreground text-center py-8">This trip has no wineries yet. Add wineries from the main map.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}