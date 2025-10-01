// components/trip-form.tsx
import { useState, useEffect } from "react";
import { useTripStore } from "@/lib/stores/tripStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { DatePicker } from "./DatePicker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AuthenticatedUser } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface TripFormProps {
  initialDate?: Date;
  user: AuthenticatedUser;
}

export default function TripForm({ initialDate, user }: TripFormProps) {
  const { toast } = useToast();
  const { fetchTripsForDate, createTrip } = useTripStore();
  const { wineries } = useWineryStore();
  const [tripDate, setTripDate] = useState<Date | undefined>(initialDate);
  const [selectedWineries, setSelectedWineries] = useState<Set<string>>(new Set());
  const [newTripName, setNewTripName] = useState("");

  useEffect(() => {
    if (tripDate) {
      fetchTripsForDate(tripDate.toISOString().split('T')[0]);
    }
  }, [tripDate, fetchTripsForDate]);

  const handleWineryToggle = (wineryId: string) => {
    setSelectedWineries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(wineryId)) {
        newSet.delete(wineryId);
      } else {
        newSet.add(wineryId);
      }
      return newSet;
    });
  };

  const handleCreateTrip = async () => {
    if (!tripDate || selectedWineries.size === 0 || !newTripName.trim()) {
      toast({ variant: "destructive", description: "Please select a date, name, and at least one winery." });
      return;
    }
    try {
      const selectedWineryObjects = wineries.filter(winery => selectedWineries.has(winery.id));
      await createTrip({
        name: newTripName,
        trip_date: tripDate.toISOString().split('T')[0],
        wineries: selectedWineryObjects,
        user_id: user.id,
      });
      toast({ description: "Trip created successfully!" });
      setNewTripName("");
      setSelectedWineries(new Set());
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to create trip." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan a New Trip</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input 
            placeholder="New trip name..."
            value={newTripName}
            onChange={(e) => setNewTripName(e.target.value)}
          />
          <DatePicker date={tripDate} onSelect={setTripDate} />
        </div>
        <div>
          <Label className="font-semibold">Select Wineries:</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
            {wineries.map(winery => (
              <div key={winery.id} className="flex items-center gap-2 p-2 border rounded-lg">
                <Checkbox 
                  id={`winery-${winery.id}`}
                  checked={selectedWineries.has(winery.id.toString())}
                  onCheckedChange={() => handleWineryToggle(winery.id.toString())}
                />
                <Label htmlFor={`winery-${winery.id}`} className="text-sm">
                  {winery.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <Button onClick={handleCreateTrip} disabled={!tripDate || selectedWineries.size === 0 || !newTripName.trim()}>
          Create Trip
        </Button>
      </CardContent>
    </Card>
  );
}
