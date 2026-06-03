// components/trip-form.tsx
"use client"

import { useState, useEffect } from "react";
import { useTripStore } from "@/lib/stores/tripStore"; 
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { DatePicker } from "./DatePicker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { AuthenticatedUser, Winery } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "./ui/badge";
import { X } from "lucide-react";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { formatDateLocal } from "@/lib/utils";
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
  onClose?: () => void;
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

export default function TripForm({ initialDate, user, onClose }: TripFormProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Use requestAnimationFrame to ensure we only mark as ready 
    // after the browser has had a chance to render the initial frame
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const { toast } = useToast();
  const { createTrip } = useTripStore();
  const { ensureInDb, upsertWinery } = useWineryDataStore();
  
  // Initialize form
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      date: initialDate,
      wineries: [],
    },
  })

  const selectedWineries = form.watch("wineries") as Winery[];

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
        trip_date: formatDateLocal(data.date),
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
      onClose?.(); // Close the modal
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to create trip." });
    }
  };

  return (
    <Card data-testid="trip-form-card" data-state={mounted ? "ready" : "loading"}>
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
                      <Input placeholder="Trip Name" {...field} data-testid="trip-name-input" />
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
              
              <PlaceAutocomplete
                placeholder="Search for a winery..."
                onPlaceSelect={async (winery) => {
                  await handleWineryToggle(winery);
                }}
                includedPrimaryTypes={["winery"]}
                className="mt-2"
                id="trip-form-winery-autocomplete"
              />

              {/* Selected Wineries List */}
              {selectedWineries.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 p-2 border rounded-lg bg-muted/30" data-testid="selected-wineries-list">
                  {selectedWineries.map((winery) => (
                    <Badge 
                      key={winery.id} 
                      className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 px-2.5 py-1 text-xs"
                      data-testid={`selected-winery-${winery.id}`}
                    >
                      <span>{winery.name}</span>
                      <button 
                        type="button" 
                        onClick={() => handleWineryToggle(winery)}
                        className="rounded-full p-0.5 hover:bg-black/10 text-primary-foreground/80 hover:text-primary-foreground transition-colors cursor-pointer"
                        aria-label={`Remove ${winery.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Show error for wineries if we added validation for min length later */}
              <FormMessage>{form.formState.errors.wineries?.message}</FormMessage>
            </div>

            <Button 
              type="submit" 
              disabled={!form.formState.isValid || form.formState.isSubmitting} 
              data-testid="create-trip-submit-btn"
              data-is-valid={form.formState.isValid}
            >
              {form.formState.isSubmitting ? "Creating..." : "Create Trip"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
