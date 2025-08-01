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
import { Star, Phone, Globe, MapPin, Calendar, MessageSquare, Plus, Trash2 } from "lucide-react"

interface Visit {
  id?: string
  visitDate: string
  userReview: string
  createdAt?: string
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

interface WineryModalProps {
  winery: Winery
  onClose: () => void
  onSaveVisit: (winery: Winery, visitData: { visitDate: string; userReview: string }) => void
  onDeleteVisit?: (winery: Winery, visitId: string) => void
}

export default function WineryModal({ winery, onClose, onSaveVisit, onDeleteVisit }: WineryModalProps) {
  const [visitDate, setVisitDate] = useState("")
  const [userReview, setUserReview] = useState("")
  const [saving, setSaving] = useState(false)

  const visits = winery.visits || []
  const sortedVisits = visits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())

  const handleSave = async () => {
    if (!visitDate.trim()) {
      console.error("Visit date is required")
      return
    }

    console.log("Saving visit:", {
      winery: winery.name,
      visitDate,
      userReview,
    })

    setSaving(true)
    try {
      await onSaveVisit(winery, { visitDate, userReview })
      console.log("Visit saved successfully")
      setVisitDate("")
      setUserReview("")
    } catch (error) {
      console.error("Error saving visit:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (onDeleteVisit && visitId) {
      console.log("Deleting visit:", visitId)
      await onDeleteVisit(winery, visitId)
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
                              {new Date(visit.visitDate).toLocaleDateString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          </div>
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
                onChange={(e) => {
                  console.log("Visit date changed:", e.target.value)
                  setVisitDate(e.target.value)
                }}
                max={new Date().toISOString().split("T")[0]}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userReview">Your Review (Optional)</Label>
              <Textarea
                id="userReview"
                placeholder="Share your thoughts about this visit..."
                value={userReview}
                onChange={(e) => {
                  console.log("Review changed:", e.target.value.length, "characters")
                  setUserReview(e.target.value)
                }}
                rows={4}
              />
            </div>

            {/* Debug info */}
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              Debug: Date={visitDate || "empty"}, Review={userReview.length} chars, Valid={!!visitDate.trim()}
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
            className={!visitDate.trim() ? "opacity-50 cursor-not-allowed" : ""}
          >
            {saving ? "Saving..." : "Add Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
