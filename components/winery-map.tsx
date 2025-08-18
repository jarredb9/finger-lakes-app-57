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
import { Star, Phone, Globe, MapPin, Calendar, MessageSquare, Plus, Trash2, Upload, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Visit {
  id?: string
  visit_date: string
  userReview: string
  createdAt?: string
  rating?: number
  photos?: string[]
}

interface Winery {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone?: string
  website?: string
  rating?: number
  userVisited?: boolean
  visits?: Visit[]
}

// Corrected the type for visitData to use snake_case
interface WineryModalProps {
  winery: Winery
  onClose: () => void
  onSaveVisit: (winery: Winery, visitData: { visit_date: string; userReview: string; rating: number; photos: string[] }) => Promise<void>
  onDeleteVisit?: (winery: Winery, visitId: string) => void
}

export default function WineryModal({ winery, onClose, onSaveVisit, onDeleteVisit }: WineryModalProps) {
  const [visitDate, setVisitDate] = useState("")
  const [userReview, setUserReview] = useState("")
  const [rating, setRating] = useState(0)
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const visits = winery.visits || []
  const sortedVisits = visits.sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())

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
      // Pass the data with the correct property name `visit_date`
      // The parent component now handles success/error toasts
      await onSaveVisit(winery, { visit_date: visitDate, userReview, rating, photos })
    } catch (error) {
      // The parent component's toast is more specific, but we can log here
      console.error("Failed to save visit:", error)
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
          {/* Previous Visits */}
          {sortedVisits.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>Your Visits</span>
              </h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {sortedVisits.map((visit, index) => (
                  <Card key={visit.id || index} className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Calendar className="w-4 h-4 text-green-600" />
                            <span className="font-medium text-green-800">
                              {new Date(visit.visit_date).toLocaleDateString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          {visit.rating && (
                            <div className="flex items-center space-x-1">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-4 h-4 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                                />
                              ))}
                            </div>
                          )}
                          {visit.userReview && (
                            <div className="flex items-start space-x-2">
                              <MessageSquare className="w-4 h-4 text-green-600 mt-1 flex-shrink-0" />
                              <p className="text-sm text-green-700">{visit.userReview}</p>
                            </div>
                          )}
                        </div>
                        {onDeleteVisit && visit.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteVisit(visit.id!)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add New Visit */}
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
                  <input id="dropzone-file" type="file" className="hidden" multiple />
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
          >
            {saving ? <Loader2 className="animate-spin" /> : "Add Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}