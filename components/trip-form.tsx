// components/trip-form.tsx
"use client"

import { useState, useEffect } from "react";
import { useTripStore } from "@/lib/stores/tripStore"; 
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { DatePicker } from "./DatePicker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { AuthenticatedUser, Winery, GooglePlaceId } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

interface TripFormProps {
  initialDate?: Date;
  user: AuthenticatedUser;
}

// Define the schema for validation
const tripSchema = z.object({
  name: z.string().min(1, "Trip name is required"),
  date: z.date({
    required_error: "Date is required",
  }),
  wineries: z.array(z.any()), // Using any for the complex Winery object
})

type TripFormValues = z.infer<typeof tripSchema>

export default function TripForm({ initialDate, user }: TripFormProps) {
  const { toast } = useToast();
  const { createTrip } = useTripStore();
  const { ensureInDb, upsertWinery } = useWineryDataStore();
  
  // Local state for search (not part of the form schema directly)
  const [winerySearch, setWinerySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const places = useMapsLibrary("places");

  // Initialize form
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      name: "",
      date: initialDate,
      wineries: [],
    },
  })

  const selectedWineries = form.watch("wineries") as Winery[];

  // Removed conflicting useEffect that updated global tripsForDate state


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
          fields: ["displayName", "location", "formattedAddress", "id", "rating"],
        };
        try {
          const { places: foundPlaces } = await places.Place.searchByText(request);
          const wineries = foundPlaces.map((place) => ({
            id: place.id! as GooglePlaceId,
            name: place.displayName!,
            address: place.formattedAddress!,
            lat: place.location!.lat(),
            lng: place.location!.lng(),
            rating: place.rating ?? undefined,
          }));
          setSearchResults(wineries);
        } catch (error) {
          toast({ variant: "destructive", description: "Winery search failed." });
        } finally {
          setIsSearching(false);
        }
      };
      search();
    }, 500);

    return () => clearTimeout(debounceSearch);
  }, [winerySearch, places, toast]);

  const handleWineryToggle = async (winery: Winery) => {
    const currentWineries = form.getValues("wineries") as Winery[];
    const isSelected = currentWineries.some(w => w.id === winery.id);

    if (isSelected) {
      form.setValue("wineries", currentWineries.filter(w => w.id !== winery.id));
    } else {
      // Add - first ensure it's in the store and DB
      upsertWinery(winery);
      const dbId = await ensureInDb(winery.id);
      
      if (!dbId) {
        toast({ variant: "destructive", description: `Could not save ${winery.name} to the database.` });
        return;
      }
      const wineryWithDbId = { ...winery, dbId };
      form.setValue("wineries", [...currentWineries, wineryWithDbId]);
    }
  };

  const onSubmit = async (data: TripFormValues) => {
    try {
      await createTrip({
        name: data.name,
        trip_date: data.date.toISOString().split('T')[0],
        wineries: data.wineries,
        user_id: user.id,
      });
      toast({ description: "Trip created successfully!" });
      
      // Reset form but keep date if desired, or reset completely
      form.reset({
        name: "",
        date: data.date, // Keep the date
        wineries: [],
      });
      setWinerySearch("");
      setSearchResults([]);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to create trip." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a New Trip</CardTitle>
        <CardDescription>Give your trip a name and date, then search for wineries to add.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="New trip name..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <DatePicker 
                        date={field.value} 
                        onSelect={field.onChange} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
              <Input 
                placeholder="Search for a winery..."
                value={winerySearch}
                onChange={(e) => setWinerySearch(e.target.value)}
                className="mt-2"
              />
              <div className="space-y-2 mt-2 max-h-60 overflow-y-auto p-1">
                {isSearching ? <p>Searching...</p> : searchResults.map(winery => (
                  <div key={winery.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <Checkbox 
                      id={`winery-${winery.id}`}
                      checked={selectedWineries.some(w => w.id === winery.id)}
                      onCheckedChange={() => handleWineryToggle(winery)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <FormLabel htmlFor={`winery-${winery.id}`} className="text-sm font-medium cursor-pointer">
                        {winery.name}
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">{winery.address}</p>
                      {winery.rating && <p className="text-sm text-muted-foreground">Rating: {winery.rating} ★</p>}
                    </div>
                  </div>
                ))}
              </div>
              {/* Show error for wineries if we added validation for min length later */}
              <FormMessage>{form.formState.errors.wineries?.message}</FormMessage>
            </div>

            <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Create Trip"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}