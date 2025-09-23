import { useState, useEffect, useRef, ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import { useUserStore } from "@/lib/stores/userStore";
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
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Star, Phone, Globe, MapPin, Calendar as CalendarIcon, Plus, Trash2, Upload, Loader2, ListPlus, Check, Edit, Users, Heart, Bookmark, ArrowRight, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Winery, Visit, Trip } from "@/lib/types";
import { Separator } from "./ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { SelectSingleEventHandler } from "react-day-picker";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { shallow } from 'zustand/shallow';

// New Responsive Date Picker Component
function DatePicker({ date, onSelect }: { date: Date | undefined, onSelect: (date: Date | undefined) => void }) {
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
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
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
                    <DrawerClose ref={closeButtonRef} className="sr-only">Close</DrawerClose>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
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

const winerySelector = (state: any) => ({
    toggleWishlist: state.toggleWishlist,
    toggleFavorite: state.toggleFavorite,
    saveVisit: state.saveVisit,
    updateVisit: state.updateVisit,
    deleteVisit: state.deleteVisit,
    isSavingVisit: state.isSavingVisit,
    isTogglingWishlist: state.isTogglingWishlist,
    isTogglingFavorite: state.isTogglingFavorite,
});

export default function WineryModal() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal } = useUIStore();
  
  const {
    toggleWishlist,
    toggleFavorite,
    saveVisit,
    updateVisit,
    deleteVisit: deleteVisitAction,
    isSavingVisit,
    isTogglingWishlist,
    isTogglingFavorite,
  } = useWineryStore(winerySelector, shallow);

  const activeWinery = useWineryStore(state => 
    activeWineryId ? state.persistentWineries.find(w => w.id === activeWineryId) : null
  );

  const { selectedTrip, addWineryToTrips, toggleWineryOnTrip, tripsForDate, fetchTripsForDate } = useTripStore();
  const { friendsRatings, friendsActivity, fetchFriendDataForWinery } = useFriendStore();
  
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
  const [userReview, setUserReview] = useState("");
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);

  const editFormRef = useRef<HTMLDivElement>(null);

  const [tripDate, setTripDate] = useState<Date | undefined>();
  const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set());
  const [newTripName, setNewTripName] = useState("");
  const [addTripNotes, setAddTripNotes] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    if (activeWinery) {
        setEditingVisitId(null);
        resetForm();
        setTripDate(undefined);
        if (activeWinery.dbId) {
            fetchFriendDataForWinery(activeWinery.dbId);
        }
    } else {
        // When modal closes or winery becomes null, reset trip-related state
        setTripDate(undefined);
        setSelectedTrips(new Set());
        setNewTripName("");
        setAddTripNotes("");
    }
  }, [activeWinery, fetchFriendDataForWinery]);
  
  useEffect(() => {
    if (tripDate) {
      const dateString = tripDate.toISOString().split("T")[0];
      fetchTripsForDate(dateString);
      setSelectedTrips(new Set());
      setNewTripName("");
      setAddTripNotes("");
    }
  }, [tripDate, fetchTripsForDate]);
  
  const handleToggleTrip = (tripId: string) => {
    setSelectedTrips(prev => {
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
    setSelectedTrips(prev => {
      const newSet = new Set(prev);
      if (newSet.has('new')) {
        newSet.delete('new');
        setNewTripName('');
        setAddTripNotes('');
      } else {
        newSet.add('new');
      }
      return newSet;
    });
  };

  if (!isWineryModalOpen || !activeWinery) {
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
    setVisitDate(new Date(visit.visit_date + 'T00:00:00').toISOString().split("T")[0]);
    setUserReview(visit.user_review || "");
    setRating(visit.rating || 0);
    setPhotos([]); // Clear photo uploads when editing

    setTimeout(() => {
        editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleSave = async () => {
    if (!visitDate.trim()) {
      toast({ title: "Error", description: "Visit date is required.", variant: "destructive" });
      return;
    }

    try {
        if (editingVisitId) {
            await updateVisit(editingVisitId, { visit_date: visitDate, user_review: userReview, rating });
            toast({ description: "Visit updated successfully." });
        } else {
            await saveVisit(activeWinery!, { visit_date: visitDate, user_review: userReview, rating, photos });
            toast({ description: "Visit added successfully." });
        }
        resetForm();
    } catch (error: any) {
        toast({ variant: "destructive", description: error.message || "An error occurred." });
    }
  };
  
  const handleDeleteVisit = async (visitId: string) => {
    if (!deleteVisitAction || !visitId) return;
    try {
        await deleteVisitAction(visitId);
        toast({ description: "Visit deleted successfully." });
    } catch (error: any) {
        toast({ variant: "destructive", description: error.message || "Failed to delete visit." });
    }
  };

  const handleWishlistToggle = async () => {
    try {
      await toggleWishlist(activeWinery, activeWinery.onWishlist);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update wishlist." });
    }
  };
  
  const handleFavoriteToggle = async () => {
    try {
      await toggleFavorite(activeWinery, activeWinery.isFavorite);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update favorites." });
    }
  };

  const handleAddToTrip = async () => {
    if (!tripDate || !activeWinery) {
        toast({ title: "Error", description: "Please select a date.", variant: "destructive" });
        return;
    }
    if (selectedTrips.size === 0) {
        toast({ variant: 'destructive', description: "Please select at least one trip or create a new one." });
        return;
    }

    // Hide the trip form immediately
    const currentTripDate = tripDate;
    const currentSelectedTrips = new Set(selectedTrips);
    const currentNewTripName = newTripName;
    const currentAddTripNotes = addTripNotes;

    setTripDate(undefined);
    setSelectedTrips(new Set());
    setNewTripName('');
    setAddTripNotes('');

    try {
        await addWineryToTrips(activeWinery, currentTripDate, currentSelectedTrips, currentNewTripName, currentAddTripNotes);
        toast({ description: "Winery added to trip(s)." });
    } catch (error: any) {
        toast({ variant: 'destructive', description: error.message || "An error occurred." });
    }
  };

  const handleToggleWineryOnActiveTrip = async () => {
    if (!selectedTrip || !activeWinery) return;
    try {
        await toggleWineryOnTrip(activeWinery, selectedTrip);
        toast({ description: `Winery updated on ${selectedTrip.name || 'trip'}.` });
        closeWineryModal();
    } catch (error: any) {
        toast({ variant: "destructive", description: error.message || "An error occurred while updating the trip." });
    }
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setPhotos(prevPhotos => [...prevPhotos, ...filesArray]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prevPhotos => prevPhotos.filter((_, i) => i !== index));
  };

  const visits = activeWinery.visits || [];
  const sortedVisits = visits.slice().sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
  
  const isOnActiveTrip = selectedTrip?.wineries.some(w => w.dbId === activeWinery.dbId) || false;

  return (
    <Dialog open={isWineryModalOpen} onOpenChange={closeWineryModal}>
      <DialogContent 
        className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
        onPointerDownOutside={(e) => {
            if ((e.target as HTMLElement)?.closest('[vaul-drawer-trigger]')) {
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
                           <DialogTitle className="text-2xl pr-4">{activeWinery.name}</DialogTitle>
                           {activeWinery.trip_name && activeWinery.trip_date && (
                                <Link
                                    href={`/trips?date=${activeWinery.trip_date.split('T')[0]}&tripId=${activeWinery.trip_id}`}
                                    passHref
                                    onClick={closeWineryModal}
                                >
                                    <Badge className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer">
                                        <Clock className="w-3 h-3 mr-1"/>On Trip: {activeWinery.trip_name}
                                    </Badge>
                                </Link>
                           )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant={activeWinery.isFavorite ? "default" : "outline"} onClick={handleFavoriteToggle} disabled={isTogglingFavorite}>
                                {isTogglingFavorite ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Star className={`mr-2 h-4 w-4 ${activeWinery.isFavorite ? 'text-yellow-400 fill-yellow-400' : ''}`}/>}
                                Favorite
                            </Button>
                            <Button size="sm" variant={activeWinery.onWishlist ? "secondary" : "outline"} onClick={handleWishlistToggle} disabled={isTogglingWishlist || activeWinery.userVisited}>
                                {isTogglingWishlist ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : activeWinery.onWishlist ? <Check className="mr-2 h-4 w-4"/> : <ListPlus className="mr-2 h-4 w-4"/>}
                                {activeWinery.onWishlist ? "On List" : "Want to Go"}
                            </Button>
                        </div>
                    </div>
                     <DialogDescription className="space-y-2 pt-2 !mt-2">
                        <div className="flex items-start space-x-2">
                          <MapPin className="w-4 h-4 mt-1 shrink-0" />
                          <span>{activeWinery.address}</span>
                        </div>
                        {activeWinery.phone && (
                          <div className="flex items-center space-x-2">
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>{activeWinery.phone}</span>
                          </div>
                        )}
                        {activeWinery.website && (
                          <div className="flex items-center space-x-2">
                            <Globe className="w-4 h-4 shrink-0" />
                            <a href={activeWinery.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                              Visit Website
                            </a>
                          </div>
                        )}
                        {activeWinery.rating && (
                          <div className="flex items-center space-x-2">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                            <span>{activeWinery.rating}/5.0 (Google Reviews)</span>
                          </div>
                        )}
                    </DialogDescription>
                </DialogHeader>
                 <Separator className="my-4"/>

                {(friendsActivity.favoritedBy.length > 0 || friendsActivity.wishlistedBy.length > 0) && (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800"><Users className="w-5 h-5" /><span>Friend Activity</span></h3>
                      <Card className="bg-gray-50 border-gray-200">
                        <CardContent className="p-4 space-y-3">
                          {friendsActivity.favoritedBy.length > 0 && (
                            <div>
                              <p className="font-semibold text-sm text-gray-700 flex items-center gap-2"><Heart className="w-4 h-4 text-red-500 fill-red-500" />Favorited by:</p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {friendsActivity.favoritedBy.map((friend: any) => (
                                  <div key={friend.id} className="flex items-center gap-2 bg-white py-1 px-2 rounded-full border shadow-sm">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} />
                                      <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs font-medium pr-1">{friend.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {friendsActivity.wishlistedBy.length > 0 && (
                            <div className={friendsActivity.favoritedBy.length > 0 ? 'mt-3' : ''}>
                              <p className="font-semibold text-sm text-gray-700 flex items-center gap-2"><Bookmark className="w-4 h-4 text-blue-500 fill-blue-500" />On wishlist for:</p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {friendsActivity.wishlistedBy.map((friend: any) => (
                                  <div key={friend.id} className="flex items-center gap-2 bg-white py-1 px-2 rounded-full border shadow-sm">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} />
                                      <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs font-medium pr-1">{friend.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                    <Separator className="my-4"/>
                  </>
                )}
                
                 {friendsRatings.length > 0 && (
                  <>
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800"><Users className="w-5 h-5" /><span>Friends' Ratings</span></h3>
                      <div className="space-y-3">
                        {friendsRatings.map((rating: any) => (
                          <Card key={rating.user_id} className="bg-blue-50 border-blue-200">
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="font-semibold text-blue-800">{rating.name}</p>
                                <div className="flex items-center">
                                  {[...Array(5)].map((_, i) => (
                                    <Star key={i} className={`w-5 h-5 ${i < rating.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                                  ))}
                                </div>
                              </div>
                              {rating.user_review && <p className="text-sm text-blue-700 bg-white p-3 rounded-md border">{rating.user_review}</p>}
                              {rating.photos && rating.photos.length > 0 && (
                                <div className="flex gap-2 mt-2">
                                  {rating.photos.map((photo: string, index: number) => {
                                    console.log("Friend's Photo URL:", photo);
                                    return <img key={index} src={photo} alt={`Friend photo ${index + 1}`} className="w-20 h-20 rounded-md object-cover"/>
                                  })}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                    <Separator className="my-4"/>
                  </>
                )}
                
                {selectedTrip ? (
                    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                        <h4 className="font-semibold">Active Trip: {selectedTrip.name}</h4>
                        <p className="text-sm text-muted-foreground">This trip is for {new Date(selectedTrip.trip_date + 'T00:00:00').toLocaleDateString()}.</p>
                        <Button 
                            onClick={handleToggleWineryOnActiveTrip}
                            variant={isOnActiveTrip ? 'destructive' : 'default'}
                            className="w-full"
                        >
                            {isOnActiveTrip ? 'Remove from Trip' : 'Add to This Trip'}
                        </Button>
                        <Link href={`/trips?date=${new Date(selectedTrip.trip_date).toISOString()}`} passHref>
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
                                <Button onClick={handleAddToTrip} disabled={selectedTrips.size === 0 || (selectedTrips.has('new') && !newTripName.trim())}>
                                    Add to Trip
                                </Button>
                            )}
                        </div>
                        {tripDate && (
                            <>
                            <div className="space-y-2">
                                <Label>Choose a trip or create a new one:</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {tripsForDate.map(trip => (
                                        <div key={trip.id} className="flex items-center gap-2 p-3 border rounded-lg bg-white">
                                            <Checkbox 
                                                id={`trip-${trip.id}`} 
                                                checked={selectedTrips.has(trip.id.toString())}
                                                onCheckedChange={() => handleToggleTrip(trip.id.toString())}
                                            />
                                            <label htmlFor={`trip-${trip.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                {trip.name || `Trip on ${new Date(trip.trip_date).toLocaleDateString()}`}
                                            </label>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-white">
                                        <Checkbox 
                                            id="new-trip" 
                                            checked={selectedTrips.has('new')} 
                                            onCheckedChange={handleToggleNewTrip}
                                        />
                                        <label htmlFor="new-trip" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Create a new trip...
                                        </label>
                                    </div>
                                </div>
                            </div>
                            {(selectedTrips.size > 0) && (
                                <div className="space-y-2">
                                    {(selectedTrips.has('new')) && (
                                        <Input placeholder="New trip name..." value={newTripName} onChange={(e) => setNewTripName(e.target.value)} />
                                    )}
                                    <Textarea placeholder="Add notes for this visit..." value={addTripNotes} onChange={(e) => setAddTripNotes(e.target.value)} />
                                </div>
                            )}
                            </>
                        )}
                    </div>
                )}
                
                <Separator className="my-4"/>
                
                <div className="space-y-4">
                     <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800"><CalendarIcon className="w-5 h-5" /><span>Your Visits</span></h3>
                      {sortedVisits.length > 0 ? (
                        <div className="space-y-3">
                          {sortedVisits.map((visit) => (
                            <Card key={visit.id} className="bg-slate-50 border-slate-200">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 space-y-1">
                                    <p className="font-semibold text-slate-800">
                                        {new Date(visit.visit_date + 'T00:00:00').toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                                    </p>
                                    {visit.rating && (
                                      <div className="flex items-center">
                                        {[...Array(5)].map((_, i) => (
                                          <Star key={i} className={`w-5 h-5 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(visit)}>
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    {deleteVisitAction && visit.id && (
                                      <Button variant="ghost" size="sm" onClick={() => handleDeleteVisit(visit.id!)} className="text-red-600 hover:text-red-800 hover:bg-red-50" aria-label={`Delete visit`}>
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {visit.user_review && <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">{visit.user_review}</p>}
                                {visit.photos && visit.photos.length > 0 && (
                                  <div className="flex gap-2 mt-2 flex-wrap">
                                    {visit.photos.map((photo, index) => {
                                      console.log("Photo URL:", photo);
                                      return <img key={index} src={photo} alt={`Visit photo ${index + 1}`} className="w-24 h-24 rounded-md object-cover"/>
                                    })}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{activeWinery.userVisited ? "You haven't reviewed any visits here yet." : "You haven't visited this winery yet."}</p>
                      )}
                </div>
            </div>
            <div ref={editFormRef} className="bg-gray-50 p-6 border-t scroll-mt-4">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                      {editingVisitId ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                      <span>{editingVisitId ? "Edit Visit" : "Add New Visit"}</span>
                    </h3>
                    {editingVisitId && (
                        <Button variant="outline" size="sm" onClick={resetForm}>Cancel Edit</Button>
                    )}
                 </div>
                 <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="visitDate">Visit Date *</Label>
                      <Input id="visitDate" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} max={new Date().toISOString().split("T")[0]} required aria-label="Visit Date" />
                    </div>
                    <div className="space-y-2">
                      <Label>Your Rating</Label>
                      <div className="flex items-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-6 h-6 cursor-pointer transition-colors ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300 hover:text-yellow-300"}`} onClick={() => setRating(i + 1)} aria-label={`Set rating to ${i + 1}`} />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userReview">Your Review (Optional)</Label>
                      <Textarea id="userReview" placeholder="e.g., 'Loved the dry Riesling! Beautiful view from the patio.'" value={userReview} onChange={(e) => setUserReview(e.target.value)} rows={4} aria-label="Your Review" />
                    </div>
                    <div className="space-y-2">
                      <Label>Photos (Optional)</Label>
                      {photos.length > 0 && (
                        <div className="flex gap-2 mb-2 flex-wrap">
                          {photos.map((file, index) => (
                            <div key={index} className="relative">
                              <img 
                                src={URL.createObjectURL(file)}
                                alt={`Preview ${index + 1}`}
                                className="w-24 h-24 rounded-md object-cover"
                                onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)} // Clean up object URLs
                              />
                              <Button 
                                variant="destructive" 
                                size="icon" 
                                className="absolute top-1 right-1 h-6 w-6"
                                onClick={() => handleRemovePhoto(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-center w-full">
                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-100">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                            <Upload className="w-8 h-8 mb-2 text-gray-500" />
                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-gray-500">PNG, JPG, GIF (MAX. 5MB)</p>
                          </div>
                          <input id="dropzone-file" type="file" className="hidden" multiple onChange={handlePhotoChange} accept="image/png, image/jpeg, image/gif"/>
                        </label>
                      </div>
                    </div>
                 </div>
                 <DialogFooter className="pt-4 mt-4">
                    <Button onClick={handleSave} disabled={!visitDate.trim() || isSavingVisit} className="w-full">
                        {isSavingVisit ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : (editingVisitId ? "Save Changes" : "Add Visit")}
                    </Button>
                 </DialogFooter>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}