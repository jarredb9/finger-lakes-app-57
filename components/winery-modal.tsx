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
import { Star, Phone, Globe, MapPin, Calendar, MessageSquare, Plus, Trash2, Upload, Loader2, Camera } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Winery, Visit } from "@/lib/types"
import { Skeleton } from "./ui/skeleton"

interface WineryModalProps {
  winery: Winery | null
  onClose: () => void
  onSaveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => Promise<void>
  onDeleteVisit?: (winery: Winery, visitId: string) => void
}

export default function WineryModal({ winery, onClose, onSaveVisit, onDeleteVisit }: WineryModalProps) {
  const [visitDate, setVisitDate] = useState("")
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
      toast({
        title: "Error",
        description: "Visit date is required.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      await onSaveVisit(winery, { visit_date: visitDate, user_review: userReview, rating, photos })
    } catch (error) {
      console.error("Save operation failed:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (onDeleteVisit && visitId) {
      await onDeleteVisit(winery, visitId)
      toast({
        title: "Success",
        description: "The visit has been deleted.",
      })
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{winery.name}</span>
            {visits.length > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {visits.length} visit{visits.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            <div className="space-y-2 mt-2">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4" />
                <span>{winery.address}</span>
              </div>
              {winery.phone && (
                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4" />
                  <span>{winery.phone}</span>
                </div>
              )}
              {winery.website && (
                <div className="flex items-center space-x-2">
                  <Globe className="w-4 h-4" />
                  <a
                    href={winery.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Visit Website
                  </a>
                </div>
              )}
              {winery.rating && (
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span>{winery.rating}/5.0 (Google Reviews)</span>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {sortedVisits.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>Your Visits</span>
              </h3>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {sortedVisits.map((visit, index) => (
                  <Card key={visit.id || index} className="bg-slate-50 border-slate-200">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-1">
                           <p className="font-semibold text-slate-800">
                              {new Date(visit.visit_date).toLocaleDateString("en-US", {
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
                                  className={`w-5 h-5 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        {onDeleteVisit && visit.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteVisit(visit.id!)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50"
                            aria-label={`Delete visit from ${new Date(visit.visit_date).toLocaleDateString()}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {visit.user_review && (
                        <div>
                          <h4 className="font-semibold text-sm text-slate-600 mb-1">Your Review</h4>
                          <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">{visit.user_review}</p>
                        </div>
                      )}

                      <div>
                        <h4 className="font-semibold text-sm text-slate-600 mb-1">Photos</h4>
                        {(visit.photos && visit.photos.length > 0) ? (
                            <div className="grid grid-cols-3 gap-2">
                                {visit.photos.map((photo, pIndex) => (
                                    <img key={pIndex} src="https://placehold.co/600x400" alt={`Visit photo ${pIndex + 1}`} className="rounded-md object-cover w-full h-24" />
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center space-x-2 text-sm text-slate-500 bg-white p-3 rounded-md border">
                                <Camera className="w-4 h-4" />
                                <span>No photos were added for this visit.</span>
                            </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <Plus className="w-5 h-5" />
              <span>Add New Visit</span>
            </h3>

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
              <Label>Rating</Label>
              <div className="flex items-center space-x-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-6 h-6 cursor-pointer ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
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
                placeholder="Share your thoughts about this visit..."
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
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-gray-500" />
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500">SVG, PNG, JPG or GIF (MAX. 800x400px)</p>
                  </div>
                  <input id="dropzone-file" type="file" className="hidden" multiple aria-label="Upload Photos" />
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={!visitDate.trim() || saving}
            aria-label="Add Visit"
          >
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding Visit...</> : "Add Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}