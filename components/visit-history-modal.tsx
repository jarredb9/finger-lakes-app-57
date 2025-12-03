"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { Visit } from "@/lib/types"
import { useUIStore } from "@/lib/stores/uiStore"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, Calendar, Search } from "lucide-react"

interface VisitHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  visits: Visit[]
}

export function VisitHistoryModal({ isOpen, onClose, visits }: VisitHistoryModalProps) {
  const { openWineryModal } = useUIStore()
  const [mobileSearch, setMobileSearch] = useState("")

  const handleRowClick = (visit: Visit) => {
     // @ts-ignore - We know this visit object has the wineryId attached from the parent mapping
     if (visit.wineryId) {
        // @ts-ignore
        openWineryModal(visit.wineryId)
        onClose()
     }
  }

  const filteredVisits = useMemo(() => {
    if (!mobileSearch) return visits
    const lower = mobileSearch.toLowerCase()
    return visits.filter(v => 
      v.wineries?.name?.toLowerCase().includes(lower) || 
      v.user_review?.toLowerCase().includes(lower)
    )
  }, [visits, mobileSearch])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="p-6 pb-4 border-b bg-background z-10">
          <DialogHeader>
            <DialogTitle>Full Visit History</DialogTitle>
            <DialogDescription>
              A complete log of all your winery visits.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Mobile View: Card List */}
            <div className="md:hidden space-y-4">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search visits..."
                        value={mobileSearch}
                        onChange={(e) => setMobileSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <div className="space-y-3">
                    {filteredVisits.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">No visits found.</p>
                    ) : (
                        filteredVisits.map((visit) => (
                            <Card 
                                key={visit.id} 
                                onClick={() => handleRowClick(visit)}
                                className="active:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-primary/20 hover:border-l-primary"
                            >
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <CardTitle className="text-base font-bold leading-tight">
                                            {visit.wineries?.name || "Unknown Winery"}
                                        </CardTitle>
                                        <span className="text-xs text-muted-foreground flex items-center shrink-0 bg-muted px-2 py-1 rounded-full">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {new Date(visit.visit_date + 'T00:00:00').toLocaleDateString()}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-2 space-y-2">
                                    {visit.rating && visit.rating > 0 && (
                                        <div className="flex items-center">
                                            {[...Array(5)].map((_, i) => (
                                                <Star 
                                                    key={i} 
                                                    className={`w-4 h-4 ${i < (visit.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} 
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {visit.user_review && (
                                        <p className="text-sm text-muted-foreground line-clamp-3 italic">
                                            &quot;{visit.user_review}&quot;
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>

            {/* Desktop View: Data Table */}
            <div className="hidden md:block">
                <div className="overflow-x-auto">
                    <DataTable columns={columns} data={visits} onRowClick={handleRowClick} />
                </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
