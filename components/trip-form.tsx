// components/trip-form.tsx
import { useState, useEffect } from "react";
import { useTripStore } from "@/lib/stores/tripStore"; 
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { DatePicker } from "./DatePicker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AuthenticatedUser, Winery } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface TripFormProps {
  initialDate?: Date;
  user: AuthenticatedUser;
}

export default function TripForm({ initialDate, user }: TripFormProps) {
  const { toast } = useToast();
  const { fetchTripsForDate, createTrip } = useTripStore();
  const { ensureWineryInDb } = useWineryStore();
  const [tripDate, setTripDate] = useState<Date | undefined>(initialDate);
  const [selectedWineries, setSelectedWineries] = useState<Map<string, Winery>>(new Map());
  const [newTripName, setNewTripName] = useState("");
  const [winerySearch, setWinerySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const places = useMapsLibrary("places");

  useEffect(() => {
    if (tripDate) {
      fetchTripsForDate(tripDate.toISOString().split('T')[0]);
    }
  }, [tripDate, fetchTripsForDate]);

  useEffect(() => {
    if (!winerySearch.trim() || !places) {
      setSearchResults([]);
      return;
    }

    const debounceSearch = setTimeout(() => {
      const search = async () => {
        setIsSearching(true);
        const request = {
          textQuery: `${winerySearch} winery`,
          fields: ["displayName", "location", "formattedAddress", "id"],
        };
        try {
          const { places: foundPlaces } = await places.Place.searchByText(request);
          const wineries = foundPlaces.map((place) => ({
            id: place.id!,
            name: place.displayName!,
            address: place.formattedAddress!,
            lat: place.location!.lat(),
            lng: place.location!.lng(),
          }));
          setSearchResults(wineries);
        } catch (error) {
          console.error("Google Places search error:", error);
          toast({ variant: "destructive", description: "Winery search failed." });
        } finally {
          setIsSearching(false);
        }
      };
      search();
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceSearch);
  }, [winerySearch, places, toast]);

  const handleWineryToggle = async (winery: Winery) => {
    // Ensure the winery exists in our DB to get a dbId for relations
    const dbId = await ensureWineryInDb(winery);
    if (!dbId) {
      toast({ variant: "destructive", description: `Could not save ${winery.name} to the database.` });
      return;
    }

    const wineryWithDbId = { ...winery, dbId };

    setSelectedWineries(prev => {
      const newMap = new Map(prev);
      if (newMap.has(winery.id)) {
        newMap.delete(winery.id);
      } else {
        newMap.set(winery.id, wineryWithDbId);
      }
      return newMap;
    });
  };

  const handleCreateTrip = async () => {
    if (!tripDate || !newTripName.trim()) {
      toast({ variant: "destructive", description: "Please select a date and provide a name for the trip." });
      return;
    }
    try {
      await createTrip({
        name: newTripName,
        trip_date: tripDate.toISOString().split('T')[0],
        wineries: Array.from(selectedWineries.values()),
        user_id: user.id,
      });
      toast({ description: "Trip created successfully!" });
      setNewTripName("");
      setSelectedWineries(new Map());
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
          <Label className="font-semibold">Select Wineries (Optional):</Label>
          <Input 
            placeholder="Search for a winery..."
            value={winerySearch}
            onChange={(e) => setWinerySearch(e.target.value)}
            className="mt-2"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2 max-h-60 overflow-y-auto p-1">
            {isSearching ? <p>Searching...</p> : searchResults.map(winery => (
              <div key={winery.id} className="flex items-center gap-2 p-2 border rounded-lg">
                <Checkbox 
                  id={`winery-${winery.id}`}
                  checked={selectedWineries.has(winery.id)}
                  onCheckedChange={() => handleWineryToggle(winery)}
                />
                <Label htmlFor={`winery-${winery.id}`} className="text-sm">
                  {winery.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <Button onClick={handleCreateTrip} disabled={!tripDate || !newTripName.trim()}>
          Create Trip
        </Button>
      </CardContent>
    </Card>
  );
}
