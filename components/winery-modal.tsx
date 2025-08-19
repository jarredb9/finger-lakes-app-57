"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Star, Phone, Globe, MapPin, Calendar, Plus, Trash2, Upload, Loader2, Camera } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Winery, Visit } from "@/lib/types"
import { Skeleton } from "./ui/skeleton"
import { Separator } from "./ui/separator"

interface WineryModalProps {
  winery: Winery | null
  onClose: () => void
  onSaveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => Promise<void>
  onDeleteVisit?: (winery: Winery, visitId: string) => void
}

export default function WineryModal({ winery, onClose, onSaveVisit, onDeleteVisit }: WineryModalProps) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0])
  const [userReview, setUserReview] = useState("")
  const [rating, setRating] = useState(0)
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  if (!winery) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const visits = winery.visits || []
  const sortedVisits = visits.slice().sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())

  const handleSave = async () => {
    if (!visitDate.trim()) {
      toast({ title: "Error", description: "Visit date is required.", variant: "destructive", })
      return
    }

    setSaving(true)
    try {
      await onSaveVisit(winery, { visit_date: visitDate, user_review: userReview, rating, photos })
      // Reset form on successful save
      setVisitDate(new Date().toISOString().split("T")[0]);
      setUserReview("");
      setRating(0);
      setPhotos([]);
    } catch (error) {
      console.error("Save operation failed:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (onDeleteVisit && visitId) {
      await onDeleteVisit(winery, visitId)
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
          {/* Left Column: Winery Info */}
          <div className="flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-2xl">
                <span>{winery.name}</span>
                {visits.length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {visits.length} visit{visits.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </DialogTitle>
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
            <div className="space-y-4 overflow-y-auto flex-grow pr-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                <Calendar className="w-5 h-5" />
                <span>Your Visits</span>
              </h3>
              {sortedVisits.length > 0 ? (
                <div className="space-y-3">
                  {sortedVisits.map((visit, index) => (
                    <Card key={visit.id || index} className="bg-slate-50 border-slate-200">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <p className="font-semibold text-slate-800">
                                {new Date(visit.visit_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                            </p>
                            {visit.rating && (
                              <div className="flex items-center">
                                {[...Array(5)].map((_, i) => (
                                  <Star key={i} className={`w-5 h-5 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                                ))}
                              </div>
                            )}
                          </div>
                          {onDeleteVisit && visit.id && (
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteVisit(visit.id!)} className="text-red-600 hover:text-red-800 hover:bg-red-50" aria-label={`Delete visit`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {visit.user_review && <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">{visit.user_review}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">You haven't recorded any visits to this winery yet.</p>
              )}
            </div>
          </div>

          {/* Right Column: Add Visit Form */}
          <div className="bg-gray-50 p-6 rounded-lg flex flex-col">
            <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800 mb-4">
              <Plus className="w-5 h-5" />
              <span>Add New Visit</span>
            </h3>
            <div className="space-y-4 flex-grow overflow-y-auto pr-2">
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
            <DialogFooter className="pt-4 mt-auto">
              <Button onClick={handleSave} disabled={!visitDate.trim() || saving} className="w-full">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding Visit...</> : "Add Visit"}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}