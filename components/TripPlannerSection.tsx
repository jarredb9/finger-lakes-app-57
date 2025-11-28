// components/TripPlannerSection.tsx
import { useState } from "react";
import { Winery } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "./DatePicker"; // Assuming DatePicker is extracted
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface TripPlannerSectionProps {
  winery: Winery;
  onClose: () => void;
}

export default function TripPlannerSection({ winery, onClose }: TripPlannerSectionProps) {
  const { toast } = useToast();
  const { selectedTrip, addWineryToTrips, toggleWineryOnTrip, tripsForDate, fetchTripsForDate } = useTripStore();
  const [tripDate, setTripDate] = useState<Date | undefined>();
  const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set());
  const [newTripName, setNewTripName] = useState("");
  const [addTripNotes, setAddTripNotes] = useState("");

  const handleDateSelect = (date: Date | undefined) => {
    setTripDate(date);
    if (date) {
      const dateString = date.toISOString().split("T")[0];
      fetchTripsForDate(dateString);
      setSelectedTrips(new Set());
      setNewTripName("");
      setAddTripNotes("");
    }
  };

  const handleToggleTrip = (tripId: string) => {
    setSelectedTrips((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tripId)) {
        newSet.delete(tripId);
      } else {
        newSet.add(tripId);
      }
      return newSet;
    });
  };

  const handleToggleNewTrip = () => {
    setSelectedTrips((prev) => {
      const newSet = new Set(prev);
      if (newSet.has("new")) {
        newSet.delete("new");
        setNewTripName("");
        setAddTripNotes("");
      } else {
        newSet.add("new");
      }
      return newSet;
    });
  };

  const handleAddToTrip = async () => {
    if (!tripDate || !winery) {
      toast({ title: "Error", description: "Please select a date.", variant: "destructive" });
      return;
    }
    if (selectedTrips.size === 0) {
      toast({ variant: "destructive", description: "Please select at least one trip or create a new one." });
      return;
    }

    const currentTripDate = tripDate;
    const currentSelectedTrips = new Set(selectedTrips);
    const currentNewTripName = newTripName;
    const currentAddTripNotes = addTripNotes;

    setTripDate(undefined);
    setSelectedTrips(new Set());
    setNewTripName("");
    setAddTripNotes("");

    try {
      await addWineryToTrips(winery, currentTripDate, currentSelectedTrips, currentNewTripName, currentAddTripNotes);
      toast({ description: "Winery added to trip(s)." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred.";
      toast({ variant: "destructive", description: message });
    }
  };

  const handleToggleWineryOnActiveTrip = async () => {
    if (!selectedTrip || !winery) return;
    try {
      await toggleWineryOnTrip(winery, selectedTrip);
      toast({ description: `Winery updated on ${selectedTrip.name || "trip"}.` });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred while updating the trip.";
      toast({ variant: "destructive", description: message });
    }
  };
  
  const isOnActiveTrip = selectedTrip?.wineries.some(w => w.dbId === winery.dbId) || false;

  if (selectedTrip) {
    return (
      <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
        <h4 className="font-semibold">Active Trip: {selectedTrip.name}</h4>
        <p className="text-sm text-muted-foreground">
          This trip is for {new Date(selectedTrip.trip_date + "T00:00:00").toLocaleDateString()}.
        </p>
        <Button onClick={handleToggleWineryOnActiveTrip} variant={isOnActiveTrip ? "destructive" : "default"} className="w-full">
          {isOnActiveTrip ? "Remove from Trip" : "Add to This Trip"}
        </Button>
        <Link href={`/trips?date=${new Date(selectedTrip.trip_date).toISOString()}`} passHref>
          <Button variant="outline" className="w-full">
            <ArrowRight className="mr-2 h-4 w-4" /> Go to Trip Planner
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h4 className="font-semibold">Add to a Trip</h4>
      <div className="flex items-center gap-2">
        <DatePicker date={tripDate} onSelect={handleDateSelect} />
        {tripDate && (
          <Button onClick={handleAddToTrip} disabled={selectedTrips.size === 0 || (selectedTrips.has("new") && !newTripName.trim())}>
            Add to Trip
          </Button>
        )}
      </div>
      {tripDate && (
        <>
          <div className="space-y-2">
            <Label>Choose a trip or create a new one:</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tripsForDate.map((trip) => (
                <div key={trip.id} className="flex items-center gap-2 p-3 border rounded-lg bg-white">
                  <Checkbox id={`trip-${trip.id}`} checked={selectedTrips.has(trip.id.toString())} onCheckedChange={() => handleToggleTrip(trip.id.toString())} />
                  <label htmlFor={`trip-${trip.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {trip.name || `Trip on ${new Date(trip.trip_date).toLocaleDateString()}`}
                  </label>
                </div>
              ))}
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-white">
                <Checkbox id="new-trip" checked={selectedTrips.has("new")} onCheckedChange={handleToggleNewTrip} />
                <label htmlFor="new-trip" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Create a new trip...
                </label>
              </div>
            </div>
          </div>
          {selectedTrips.size > 0 && (
            <div className="space-y-2">
              {selectedTrips.has("new") && <Input placeholder="New trip name..." value={newTripName} onChange={(e) => setNewTripName(e.target.value)} />}
              <Textarea placeholder="Add notes for this visit..." value={addTripNotes} onChange={(e) => setAddTripNotes(e.target.value)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}