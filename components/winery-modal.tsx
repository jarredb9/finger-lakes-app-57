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
import { Star, Phone, Globe, MapPin, Calendar, Plus, Trash2, Upload, Loader2, Camera, ListPlus, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Winery, Visit } from "@/lib/types"
import { Skeleton } from "./ui/skeleton"
import { Separator } from "./ui/separator"

interface WineryModalProps {
  winery: Winery | null
  onClose: () => void
  onSaveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => Promise<void>
  onDeleteVisit?: (winery: Winery, visitId: string) => void
  onToggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>
}

export default function WineryModal({ winery, onClose, onSaveVisit, onDeleteVisit, onToggleWishlist }: WineryModalProps) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0])
  const [userReview, setUserReview] = useState("")
  const [rating, setRating] = useState(0)
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const { toast } = useToast()

  if (!winery) { return null }

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
      setVisitDate(new Date().toISOString().split("T")[0]);
      setUserReview("");
      setRating(0);
      setPhotos([]);
    } catch (error) { console.error("Save operation failed:", error) } 
    finally { setSaving(false) }
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (onDeleteVisit && visitId) await onDeleteVisit(winery, visitId)
  }

  const handleWishlistToggle = async () => {
    setWishlistLoading(true);
    await onToggleWishlist(winery, !!winery.onWishlist);
    setWishlistLoading(false);
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-screen sm:max-h-[90vh] p-0 flex flex-col">
        <div className="overflow-y-auto">
          <div className="p-6">
              <DialogHeader>
                <div className="flex justify-between items-start">
                    <DialogTitle className="text-2xl pr-4">{winery.name}</DialogTitle>
                    <Button 
                        size="sm" 
                        variant={winery.onWishlist ? "secondary" : "outline"} 
                        onClick={handleWishlistToggle} 
                        disabled={wishlistLoading || winery.userVisited}
                        className="shrink-0"
                    >
                        {wishlistLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : winery.onWishlist ? <Check className="mr-2 h-4 w-4"/> : <ListPlus className="mr-2 h-4 w-4"/>}
                        {winery.onWishlist ? "On Wishlist" : "Want to Go"}
                    </Button>
                </div>
                <DialogDescription className="space-y-2 pt-2 !mt-2">
                    {/* Winery Details... */}
                </DialogDescription>
              </DialogHeader>
              <Separator className="my-4"/>
              {/* Visit History... */}
          </div>
          {/* Add Visit Form... */}
        </div>
      </DialogContent>
    </Dialog>
  )
}