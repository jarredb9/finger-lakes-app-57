"use client"

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
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Phone, Globe, MapPin, Calendar as CalendarIcon, Plus, Trash2, Upload, Loader2, ListPlus, Check, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Winery, Visit, Trip } from "@/lib/types";
import { Separator } from "./ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

// New Responsive Date Picker Component
function DatePicker({ date, onSelect }: { date: Date | undefined, onSelect: (date: Date | undefined) => void }) {
    const isMobile = useIsMobile();
    
    if (isMobile) {
        return (
            <Drawer>
                <DrawerTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? date.toLocaleDateString() : <span>Pick a date</span>}
                    </Button>
                </DrawerTrigger>
                <DrawerContent className="p-4">
                    {/* FIX: Added DrawerHeader and DrawerTitle for accessibility */}
                    <DrawerHeader>
                        <DrawerTitle>Select a date</DrawerTitle>
                    </DrawerHeader>
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={onSelect}
                        initialFocus
                    />
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


interface WineryModalProps {
  winery: Winery | null;
  onClose: () => void;
  onSaveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => Promise<void>;
  onUpdateVisit: (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => Promise<void>;
  onDeleteVisit?: (winery: Winery, visitId: string) => void;
  onToggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>;
  onToggleFavorite: (winery: Winery, isFavorite: boolean) => Promise<void>;
}

export default function WineryModal({ winery, onClose, onSaveVisit, onUpdateVisit, onDeleteVisit, onToggleWishlist, onToggleFavorite }: WineryModalProps) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
  const [userReview, setUserReview] = useState("");
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);

  const editFormRef = useRef<HTMLDivElement>(null);

  const [tripDate, setTripDate] = useState<Date | undefined>();
  const [tripsOnDate, setTripsOnDate] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [tripNameOrNote, setTripNameOrNote] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    setEditingVisitId(null);
    resetForm();
    setTripDate(undefined);
  }, [winery]);
  
  useEffect(() => {
    if (tripDate) {
        const fetchTrips = async () => {
            const dateString = tripDate.toISOString().split("T")[0];
            const response = await fetch(`/api/trips?date=${dateString}`);
            if (response.ok) {
                const data = await response.json();
                setTripsOnDate(Array.isArray(data) ? data : []);
                setSelectedTripId("");
                setTripNameOrNote("");
            }
        };
        fetchTrips();
    } else {
        setTripsOnDate([]);
    }
  }, [tripDate]);

  if (!winery) { return null; }

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

    setTimeout(() => {
        editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleSave = async () => {
    if (!visitDate.trim()) {
      toast({ title: "Error", description: "Visit date is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingVisitId) {
        await onUpdateVisit(editingVisitId, { visit_date: visitDate, user_review: userReview, rating });
      } else {
        await onSaveVisit(winery, { visit_date: visitDate, user_review: userReview, rating, photos });
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
        await onDeleteVisit(winery, visitId);
    }
  };

  const handleWishlistToggle = async () => {
    setWishlistLoading(true);
    await onToggleWishlist(winery, !!winery.onWishlist);
    setWishlistLoading(false);
  };
  
  const handleFavoriteToggle = async () => {
    setFavoriteLoading(true);
    await onToggleFavorite(winery, !!winery.isFavorite);
    setFavoriteLoading(false);
  };

  const handleAddToTrip = async () => {
    if (!tripDate || !winery.dbId) {
        toast({ title: "Error", description: "Please select a date.", variant: "destructive" });
        return;
    }

    const payload: { date: string; wineryId: number; name?: string; tripId?: number; notes?: string; } = {
        date: tripDate.toISOString().split("T")[0],
        wineryId: winery.dbId,
        notes: (selectedTripId !== 'new') ? tripNameOrNote : undefined,
    };

    if (selectedTripId === 'new') {
        if (!tripNameOrNote.trim()) {
            toast({ variant: 'destructive', description: "Please enter a name for the new trip." });
            return;
        }
        payload.name = tripNameOrNote;
    } else if (selectedTripId) {
        payload.tripId = parseInt(selectedTripId, 10);
    } else {
        toast({ variant: 'destructive', description: "Please select a trip or create a new one." });
        return;
    }
    
    try {
        const response = await fetch('/api/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            toast({ description: "Winery added to your trip." });
            setTripDate(undefined);
        } else {
             const errorData = await response.json();
             toast({ variant: 'destructive', description: `Failed to add to trip: ${errorData.error}` });
        }
    } catch (error) {
        toast({ variant: 'destructive', description: "An error occurred." });
    }
  };

  const visits = winery.visits || [];
  const sortedVisits = visits.slice().sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col">
        <div className="overflow-y-auto">
            <div className="p-6">
                <DialogHeader>
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-start gap-4">
                        <DialogTitle className="text-2xl pr-4">{winery.name}</DialogTitle>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant={winery.isFavorite ? "default" : "outline"} onClick={handleFavoriteToggle} disabled={favoriteLoading}>
                                {favoriteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Star className={`mr-2 h-4 w-4 ${winery.isFavorite ? 'text-yellow-400 fill-yellow-400' : ''}`}/>}
                                Favorite
                            </Button>
                            <Button size="sm" variant={winery.onWishlist ? "secondary" : "outline"} onClick={handleWishlistToggle} disabled={wishlistLoading || winery.userVisited}>
                                {wishlistLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : winery.onWishlist ? <Check className="mr-2 h-4 w-4"/> : <ListPlus className="mr-2 h-4 w-4"/>}
                                {winery.onWishlist ? "On List" : "Want to Go"}
                            </Button>
                        </div>
                    </div>
                     <DialogDescription className="space-y-2 pt-2 !mt-2">
                        <div className="flex items-start space-x-2">
                          <MapPin className="w-4 h-4 mt-1 shrink-0" />
                          <span>{winery.address}</span>
                        </div>
                        {winery.phone && (
                          <div className="flex items-center space-x-2">
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>{winery.phone}</span>
                          </div>
                        )}
                        {winery.website && (
                          <div className="flex items-center space-x-2">
                            <Globe className="w-4 h-4 shrink-0" />
                            <a href={winery.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                              Visit Website
                            </a>
                          </div>
                        )}
                        {winery.rating && (
                          <div className="flex items-center space-x-2">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                            <span>{winery.rating}/5.0 (Google Reviews)</span>
                          </div>
                        )}
                    </DialogDescription>
                </DialogHeader>
                 <Separator className="my-4"/>
                
                <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                    <h4 className="font-semibold">Add to a Trip</h4>
                    <div className="flex flex-col sm:flex-row gap-2 items-center">
                        <DatePicker date={tripDate} onSelect={setTripDate} />
                        {tripDate && (
                            <Select onValueChange={setSelectedTripId} value={selectedTripId}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Select a trip" />
                                </SelectTrigger>
                                <SelectContent>
                                    {tripsOnDate.map(trip => (
                                        <SelectItem key={trip.id} value={trip.id.toString()}>{trip.name || `Trip on ${new Date(trip.trip_date).toLocaleDateString()}`}</SelectItem>
                                    ))}
                                    <SelectItem value="new">Create a new trip...</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    {selectedTripId === 'new' && tripDate && (
                        <Input placeholder="New trip name..." value={tripNameOrNote} onChange={(e) => setTripNameOrNote(e.target.value)} className="mt-2"/>
                    )}
                    {selectedTripId && selectedTripId !== 'new' && tripDate && (
                        <Textarea placeholder="Add a note for this visit (optional)..." value={tripNameOrNote} onChange={(e) => setTripNameOrNote(e.target.value)} className="mt-2"/>
                    )}
                    {tripDate && <Button onClick={handleAddToTrip} className="w-full sm:w-auto mt-2">Add to Trip</Button>}
                </div>

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
                                        <Edit className="w-4 w-4" />
                                    </Button>
                                    {onDeleteVisit && visit.id && (
                                      <Button variant="ghost" size="sm" onClick={() => handleDeleteVisit(visit.id!)} className="text-red-600 hover:text-red-800 hover:bg-red-50" aria-label={`Delete visit`}>
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {visit.user_review && <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">{visit.user_review}</p>}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{winery.userVisited ? "You haven't reviewed any visits here yet." : "You haven't visited this winery yet."}</p>
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
                      <div className="flex items-center justify-center w-full">
                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-100">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                            <Upload className="w-8 h-8 mb-2 text-gray-500" />
                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span></p>
                            <p className="text-xs text-gray-500">PNG, JPG, GIF</p>
                          </div>
                          <input id="dropzone-file" type="file" className="hidden" multiple aria-label="Upload Photos" />
                        </label>
                      </div>
                    </div>
                 </div>
                 <DialogFooter className="pt-4 mt-4">
                    <Button onClick={handleSave} disabled={!visitDate.trim() || saving} className="w-full">
                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : (editingVisitId ? "Save Changes" : "Add Visit")}
                    </Button>
                 </DialogFooter>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}