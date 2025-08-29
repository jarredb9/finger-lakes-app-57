// file: components/winery-modal.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Star,
  Phone,
  Globe,
  MapPin,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Upload,
  Loader2,
  ListPlus,
  Check,
  Edit,
  Users,
  Heart,
  Bookmark,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Winery, Visit, Trip } from "@/lib/types";
import { Separator } from "./ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { SelectSingleEventHandler } from "react-day-picker";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

// New Responsive Date Picker Component
function DatePicker({
  date,
  onSelect,
}: {
  date: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}) {
  const isMobile = useIsMobile();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleDateSelect: SelectSingleEventHandler = (selectedDate) => {
    onSelect(selectedDate);
    if (isMobile) {
      closeButtonRef.current?.click();
    }
  };

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? date.toLocaleDateString() : <span>Pick a date</span>}
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Select a date</DrawerTitle>
            <DrawerDescription>Choose a date for your trip.</DrawerDescription>
          </DrawerHeader>
          <div className="p-4">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              initialFocus
            />
          </div>
          <DrawerClose ref={closeButtonRef} className="sr-only">
            Close
          </DrawerClose>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full sm:w-auto justify-start text-left font-normal"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? date.toLocaleDateString() : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface WineryModalProps {
  winery: Winery | null;
  onClose: () => void;
  onSaveVisit: (
    winery: Winery,
    visitData: {
      visit_date: string;
      user_review: string;
      rating: number;
      photos: string[];
    }
  ) => Promise<void>;
  onUpdateVisit: (
    visitId: string,
    visitData: { visit_date: string; user_review: string; rating: number }
  ) => Promise<void>;
  onDeleteVisit?: (winery: Winery, visitId: string) => void;
  onToggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>;
  onToggleFavorite: (winery: Winery, isFavorite: boolean) => Promise<void>;
  selectedTrip?: Trip | null;
}

export default function WineryModal({
  winery,
  onClose,
  onSaveVisit,
  onUpdateVisit,
  onDeleteVisit,
  onToggleWishlist,
  onToggleFavorite,
  selectedTrip,
}: WineryModalProps) {
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [userReview, setUserReview] = useState("");
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [friendsRatings, setFriendsRatings] = useState([]);
  const [friendsActivity, setFriendsActivity] = useState<{
    favoritedBy: any[];
    wishlistedBy: any[];
  }>({ favoritedBy: [], wishlistedBy: [] });

  // This new state holds the winery data and ensures it has a dbId
  const [internalWinery, setInternalWinery] = useState<Winery | null>(winery);

  const editFormRef = useRef<HTMLDivElement>(null);

  const [tripDate, setTripDate] = useState<Date | undefined>();
  const [tripsOnDate, setTripsOnDate] = useState<Trip[]>([]);
  const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set());
  const [newTripName, setNewTripName] = useState("");
  const [addTripNotes, setAddTripNotes] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    const ensureWineryHasDbId = async (wineryToProcess: Winery | null) => {
      if (wineryToProcess && !wineryToProcess.dbId) {
        try {
          const response = await fetch("/api/wineries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(wineryToProcess),
          });
          if (response.ok) {
            const { dbId } = await response.json();
            setInternalWinery((prev) => (prev ? { ...prev, dbId } : null));
          } else {
            toast({
              variant: "destructive",
              description: "Could not retrieve winery details.",
            });
          }
        } catch (error) {
          console.error("Failed to ensure winery dbId", error);
        }
      } else {
        setInternalWinery(wineryToProcess);
      }
    };
    ensureWineryHasDbId(winery);
  }, [winery, toast]);

  useEffect(() => {
    setEditingVisitId(null);
    resetForm();
    setTripDate(undefined);

    if (internalWinery && internalWinery.dbId) {
      const fetchFriendsRatings = async () => {
        try {
          const response = await fetch(
            `/api/wineries?wineryId=${internalWinery.dbId}&ratingsFor=friends`
          );
          if (response.ok) {
            const data = await response.json();
            setFriendsRatings(data);
          } else {
            console.error("Failed to fetch friends ratings");
            setFriendsRatings([]);
          }
        } catch (error) {
          console.error("Error fetching friends ratings:", error);
          setFriendsRatings([]);
        }
      };

      const fetchFriendsActivity = async () => {
        try {
          const response = await fetch(
            `/api/wineries/${internalWinery.dbId}/friends-activity`
          );
          if (response.ok) {
            const data = await response.json();
            setFriendsActivity(data);
          } else {
            console.error("Failed to fetch friends activity");
            setFriendsActivity({ favoritedBy: [], wishlistedBy: [] });
          }
        } catch (error) {
          console.error("Error fetching friends activity", error);
          setFriendsActivity({ favoritedBy: [], wishlistedBy: [] });
        }
      };

      fetchFriendsRatings();
      fetchFriendsActivity();
    } else {
      setFriendsRatings([]);
      setFriendsActivity({ favoritedBy: [], wishlistedBy: [] });
    }
  }, [internalWinery]);

  useEffect(() => {
    if (tripDate) {
      const fetchTrips = async () => {
        const dateString = tripDate.toISOString().split("T")[0];
        const response = await fetch(`/api/trips?date=${dateString}`);
        if (response.ok) {
          const data = await response.json();
          setTripsOnDate(Array.isArray(data) ? data : []);
          setSelectedTrips(new Set());
          setNewTripName("");
          setAddTripNotes("");
        }
      };
      fetchTrips();
    } else {
      setTripsOnDate([]);
    }
  }, [tripDate]);

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

  if (!internalWinery) {
    return null;
  }

  const resetForm = () => {
    setVisitDate(new Date().toISOString().split("T")[0]);
    setUserReview("");
    setRating(0);
    setPhotos([]);
    setEditingVisitId(null);
  };

  const handleEditClick = (visit: Visit) => {
    if (!visit.id) return;
    setEditingVisitId(visit.id);
    setVisitDate(
      new Date(visit.visit_date + "T00:00:00").toISOString().split("T")[0]
    );
    setUserReview(visit.user_review || "");
    setRating(visit.rating || 0);

    setTimeout(() => {
      editFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  };

  const handleSave = async () => {
    if (!visitDate.trim()) {
      toast({
        title: "Error",
        description: "Visit date is required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (editingVisitId) {
        await onUpdateVisit(editingVisitId, {
          visit_date: visitDate,
          user_review: userReview,
          rating,
        });
      } else {
        await onSaveVisit(internalWinery, {
          visit_date: visitDate,
          user_review: userReview,
          rating,
          photos,
        });
      }
      resetForm();
    } catch (error) {
      console.error("Save/Update operation failed:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (onDeleteVisit && visitId) {
      await onDeleteVisit(internalWinery, visitId);
    }
  };

  const handleWishlistToggle = async () => {
    setWishlistLoading(true);
    await onToggleWishlist(internalWinery, !!internalWinery.onWishlist);
    setWishlistLoading(false);
  };

  const handleFavoriteToggle = async () => {
    setFavoriteLoading(true);
    await onToggleFavorite(internalWinery, !!internalWinery.isFavorite);
    setFavoriteLoading(false);
  };

  const handleAddToTrip = async () => {
    if (!tripDate || !internalWinery.dbId) {
      toast({
        title: "Error",
        description: "Please select a date.",
        variant: "destructive",
      });
      return;
    }

    if (selectedTrips.size === 0) {
      toast({
        variant: "destructive",
        description: "Please select at least one trip or create a new one.",
      });
      return;
    }

    // Process each selected trip
    const tripPromises = Array.from(selectedTrips).map((tripId) => {
      // ** FIX: Correctly construct the payload to send to the API endpoint. **
      const payload: {
        date: string;
        wineryId: number;
        name?: string;
        tripIds?: number[];
        notes?: string;
      } = {
        date: tripDate.toISOString().split("T")[0],
        wineryId: internalWinery.dbId!,
      };

      if (tripId === "new") {
        if (!newTripName.trim()) {
          toast({
            variant: "destructive",
            description: "Please enter a name for the new trip.",
          });
          return Promise.reject("New trip requires a name.");
        }
        payload.name = newTripName;
        payload.notes = addTripNotes;
      } else {
        payload.tripIds = [parseInt(tripId, 10)];
        payload.notes = addTripNotes;
      }

      return fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((response) => {
        if (!response.ok) {
          return response.json().then((errorData) => {
            throw new Error(errorData.error || "Failed to add to trip.");
          });
        }
      });
    });

    try {
      await Promise.all(tripPromises);
      toast({ description: "Winery added to trip(s)." });
      setTripDate(undefined);
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: error.message || "An error occurred.",
      });
    }
  };

  const handleToggleWineryOnActiveTrip = async () => {
    if (!selectedTrip || !internalWinery.dbId) return;

    const isOnTrip = selectedTrip.wineries.some(
      (w) => w.dbId === internalWinery.dbId
    );

    try {
      if (isOnTrip) {
        // Remove winery from trip
        const response = await fetch(`/api/trips/${selectedTrip.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeWineryId: internalWinery.dbId }),
        });
        if (response.ok) {
          toast({ description: "Winery removed from trip." });
          onClose(); // Close the modal to refresh the map view
        } else {
          toast({
            variant: "destructive",
            description: "Failed to remove winery from trip.",
          });
        }
      } else {
        // Add winery to trip
        const response = await fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedTrip.trip_date.split("T")[0],
            wineryId: internalWinery.dbId,
            tripIds: [selectedTrip.id],
          }),
        });
        if (response.ok) {
          toast({ description: `Added to ${selectedTrip.name || "trip"}.` });
          onClose(); // Close the modal to refresh the map view
        } else {
          toast({
            variant: "destructive",
            description: "Failed to add winery to trip.",
          });
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        description: "An error occurred while updating the trip.",
      });
    }
  };

  const visits = internalWinery.visits || [];
  const sortedVisits = visits
    .slice()
    .sort(
      (a, b) =>
        new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime()
    );

  // ** FIX: Determine if the winery is on the currently selected trip **
  const isOnActiveTrip =
    selectedTrip?.wineries.some((w) => w.dbId === internalWinery.dbId) || false;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
        onPointerDownOutside={(e) => {
          if ((e.target as HTMLElement)?.closest("[vaul-drawer-trigger]")) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <div className="overflow-y-auto">
          <div className="p-6">
            <DialogHeader>
              <div className="flex flex-col-reverse sm:flex-row justify-between items-start gap-4">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-2xl pr-4">
                    {internalWinery.name}
                  </DialogTitle>
                  {selectedTrip && internalWinery.trip_name && (
                    <Badge className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer">
                      <Link
                        href={`/trips?date=${new Date(
                          selectedTrip.trip_date
                        ).toISOString()}`}
                        passHref
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        On Trip: {internalWinery.trip_name}
                      </Link>
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={internalWinery.isFavorite ? "default" : "outline"}
                    onClick={handleFavoriteToggle}
                    disabled={favoriteLoading}
                  >
                    {favoriteLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Star
                        className={`mr-2 h-4 w-4 ${
                          internalWinery.isFavorite
                            ? "text-yellow-400 fill-yellow-400"
                            : ""
                        }`}
                      />
                    )}
                    Favorite
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      internalWinery.onWishlist ? "secondary" : "outline"
                    }
                    onClick={handleWishlistToggle}
                    disabled={wishlistLoading || internalWinery.userVisited}
                  >
                    {wishlistLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : internalWinery.onWishlist ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <ListPlus className="mr-2 h-4 w-4" />
                    )}
                    {internalWinery.onWishlist ? "On List" : "Want to Go"}
                  </Button>
                </div>
              </div>
              <DialogDescription className="space-y-2 pt-2 !mt-2">
                <div className="flex items-start space-x-2">
                  <MapPin className="w-4 h-4 mt-1 shrink-0" />
                  <span>{internalWinery.address}</span>
                </div>
                {internalWinery.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>{internalWinery.phone}</span>
                  </div>
                )}
                {internalWinery.website && (
                  <div className="flex items-center space-x-2">
                    <Globe className="w-4 h-4 shrink-0" />
                    <a
                      href={internalWinery.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate"
                    >
                      Visit Website
                    </a>
                  </div>
                )}
                {internalWinery.rating && (
                  <div className="flex items-center space-x-2">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                    <span>{internalWinery.rating}/5.0 (Google Reviews)</span>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <Separator className="my-4" />

            {/* NEW FRIENDS ACTIVITY SECTION */}
            {(friendsActivity.favoritedBy.length > 0 ||
              friendsActivity.wishlistedBy.length > 0) && (
              <>
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                    <Users className="w-5 h-5" />
                    <span>Friend Activity</span>
                  </h3>
                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-4 space-y-3">
                      {friendsActivity.favoritedBy.length > 0 && (
                        <div>
                          <p className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                            Favorited by:
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {friendsActivity.favoritedBy.map((friend: any) => (
                              <div
                                key={friend.id}
                                className="flex items-center gap-2 bg-white py-1 px-2 rounded-full border shadow-sm"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarImage
                                    src={`https://i.pravatar.cc/150?u=${friend.email}`}
                                  />
                                  <AvatarFallback>
                                    {friend.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs font-medium pr-1">
                                  {friend.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {friendsActivity.wishlistedBy.length > 0 && (
                        <div
                          className={
                            friendsActivity.favoritedBy.length > 0 ? "mt-3" : ""
                          }
                        >
                          <p className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                            <Bookmark className="w-4 h-4 text-blue-500 fill-blue-500" />
                            On wishlist for:
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {friendsActivity.wishlistedBy.map((friend: any) => (
                              <div
                                key={friend.id}
                                className="flex items-center gap-2 bg-white py-1 px-2 rounded-full border shadow-sm"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarImage
                                    src={`https://i.pravatar.cc/150?u=${friend.email}`}
                                  />
                                  <AvatarFallback>
                                    {friend.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs font-medium pr-1">
                                  {friend.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <Separator className="my-4" />
              </>
            )}

            {friendsRatings.length > 0 && (
              <>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                    <Users className="w-5 h-5" />
                    <span>Friends' Ratings</span>
                  </h3>
                  <div className="space-y-3">
                    {friendsRatings.map((rating: any) => (
                      <Card
                        key={rating.user_id}
                        className="bg-blue-50 border-blue-200"
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-blue-800">
                              {rating.name}
                            </p>
                            <div className="flex items-center">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-5 h-5 ${
                                    i < rating.rating!
                                      ? "text-yellow-400 fill-yellow-400"
                                      : "text-gray-300"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          {rating.user_review && (
                            <p className="text-sm text-blue-700 bg-white p-3 rounded-md border">
                              {rating.user_review}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
                <Separator className="my-4" />
              </>
            )}

            {selectedTrip ? (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h4 className="font-semibold">
                  Active Trip: {selectedTrip.name}
                </h4>
                <p className="text-sm text-muted-foreground">
                  This trip is for{" "}
                  {new Date(
                    selectedTrip.trip_date + "T00:00:00"
                  ).toLocaleDateString()}
                  .
                </p>
                <Button
                  onClick={handleToggleWineryOnActiveTrip}
                  variant={isOnActiveTrip ? "destructive" : "default"}
                  className="w-full"
                >
                  {isOnActiveTrip ? "Remove from Trip" : "Add to This Trip"}
                </Button>
                <Link
                  href={`/trips?date=${new Date(
                    selectedTrip.trip_date
                  ).toISOString()}`}
                  passHref
                >
                  <Button variant="outline" className="w-full">
                    <ArrowRight className="mr-2 h-4 w-4" /> Go to Trip Planner
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h4 className="font-semibold">Add to a Trip</h4>
                <div className="flex items-center gap-2">
                  <DatePicker date={tripDate} onSelect={setTripDate} />
                  {tripDate && (
                    <Button
                      onClick={handleAddToTrip}
                      disabled={
                        !internalWinery.dbId ||
                        selectedTrips.size === 0 ||
                        (selectedTrips.has("new") && !newTripName.trim())
                      }
                    >
                      Add to Trip
                    </Button>
                  )}
                </div>
                {tripDate && (
                  <>
                    <div className="space-y-2">
                      <Label>Choose a trip or create a new one:</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tripsOnDate.map((trip) => (
                          <div
                            key={trip.id}
                            className="flex items-center gap-2 p-3 border rounded-lg bg-white"
                          >
                            <Checkbox
                              id={`trip-${trip.id}`}
                              checked={selectedTrips.has(trip.id.toString())}
                              onCheckedChange={() =>
                                handleToggleTrip(trip.id.toString())
                              }
                            />
                            <label
                              htmlFor={`trip-${trip.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {trip.name ||
                                `Trip on ${new Date(
                                  trip.trip_date
                                ).toLocaleDateString()}`}
                            </label>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-white">
                          <Checkbox
                            id="new-trip"
                            checked={selectedTrips.has("new")}
                            onCheckedChange={handleToggleNewTrip}
                          />
                          <label
                            htmlFor="new-trip"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Create a new trip...
                          </label>
                        </div>
                      </div>
                    </div>
                    {selectedTrips.size > 0 && (
                      <div className="space-y-2">
                        {selectedTrips.has("new") && (
                          <Input
                            placeholder="New trip name..."
                            value={newTripName}
                            onChange={(e) => setNewTripName(e.target.value)}
                          />
                        )}
                        <Textarea
                          placeholder="Add notes for this visit..."
                          value={addTripNotes}
                          onChange={(e) => setAddTripNotes(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <Separator className="my-4" />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                <CalendarIcon className="w-5 h-5" />
                <span>Your Visits</span>
              </h3>
              {sortedVisits.length > 0 ? (
                <div className="space-y-3">
                  {sortedVisits.map((visit) => (
                    <Card
                      key={visit.id}
                      className="bg-slate-50 border-slate-200"
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <p className="font-semibold text-slate-800">
                              {new Date(
                                visit.visit_date + "T00:00:00"
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                            {visit.rating && (
                              <div className="flex items-center">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-5 h-5 ${
                                      i < visit.rating!
                                        ? "text-yellow-400 fill-yellow-400"
                                        : "text-gray-300"
                                    }`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(visit)}
                            >
                              <Edit className="w-4 w-4" />
                            </Button>
                            {onDeleteVisit && visit.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteVisit(visit.id!)}
                                className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                aria-label={`Delete visit`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {visit.user_review && (
                          <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">
                            {visit.user_review}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {internalWinery.userVisited
                    ? "You haven't reviewed any visits here yet."
                    : "You haven't visited this winery yet."}
                </p>
              )}
            </div>
          </div>
          <div
            ref={editFormRef}
            className="bg-gray-50 p-6 border-t scroll-mt-4"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                {editingVisitId ? (
                  <Edit className="w-5 h-5" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                <span>{editingVisitId ? "Edit Visit" : "Add New Visit"}</span>
              </h3>
              {editingVisitId && (
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Cancel Edit
                </Button>
              )}
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="visitDate">Visit Date *</Label>
                <Input
                  id="visitDate"
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  required
                  aria-label="Visit Date"
                />
              </div>
              <div className="space-y-2">
                <Label>Your Rating</Label>
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-6 h-6 cursor-pointer transition-colors ${
                        i < rating
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-300 hover:text-yellow-300"
                      }`}
                      onClick={() => setRating(i + 1)}
                      aria-label={`Set rating to ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="userReview">Your Review (Optional)</Label>
                <Textarea
                  id="userReview"
                  placeholder="e.g., 'Loved the dry Riesling! Beautiful view from the patio.'"
                  value={userReview}
                  onChange={(e) => setUserReview(e.target.value)}
                  rows={4}
                  aria-label="Your Review"
                />
              </div>
              <div className="space-y-2">
                <Label>Photos (Optional)</Label>
                <div className="flex items-center justify-center w-full">
                  <label
                    htmlFor="dropzone-file"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-100"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                      <Upload className="w-8 h-8 mb-2 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span>
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF</p>
                    </div>
                    <input
                      id="dropzone-file"
                      type="file"
                      className="hidden"
                      multiple
                      aria-label="Upload Photos"
                    />
                  </label>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4 mt-4">
              <Button
                onClick={handleSave}
                disabled={!visitDate.trim() || saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : editingVisitId ? (
                  "Save Changes"
                ) : (
                  "Add Visit"
                )}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
