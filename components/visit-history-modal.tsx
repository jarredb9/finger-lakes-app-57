"use client"

import { useState, useMemo, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { VisitWithWinery } from "@/lib/types" // Import new types
import { useUIStore } from "@/lib/stores/uiStore"
import { useWineryStore } from "@/lib/stores/wineryStore"
import { useVisitStore } from "@/lib/stores/visitStore"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, Calendar, Search, ArrowUp, ArrowDown, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pagination, PaginationContent, PaginationItem, PaginationNext } from "@/components/ui/pagination";


interface VisitHistoryModalProps {
  // visits prop removed, as this component now fetches its own data
}

type SortField = "date" | "rating" | "name"
type SortDirection = "asc" | "desc"

export function VisitHistoryModal({}: VisitHistoryModalProps) {
  const { openWineryModal, isVisitHistoryModalOpen, setVisitHistoryModalOpen } = useUIStore()
  const { ensureWineryDetails } = useWineryStore()
  const { 
      visits, 
      isLoading, 
      page, 
      hasMore, 
      fetchVisits 
  } = useVisitStore()
  
  const [mobileSearch, setMobileSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  useEffect(() => {
    if (isVisitHistoryModalOpen) {
        fetchVisits(1, true);
    }
  }, [isVisitHistoryModalOpen, fetchVisits]);


  const handleRowClick = (visit: VisitWithWinery) => {
     setVisitHistoryModalOpen(false) // Close the current modal first
     
     if (visit.wineries?.google_place_id) {
        // Ensure data is loaded
        ensureWineryDetails(visit.wineries.google_place_id);
        
        // Decouple the open call to avoid ARIA hidden/focus conflicts 
        // between the closing and opening dialogs.
        setTimeout(() => {
            // Open the winery modal and tell it to return to history when closed
            openWineryModal(visit.wineries.google_place_id, true)
        }, 100);
     }
  }

  const toggleSortDirection = () => {
    setSortDirection(prev => prev === "asc" ? "desc" : "asc")
  }

  const filteredAndSortedVisits = useMemo(() => {
    let result = [...visits]

    // Filter
    if (mobileSearch) {
        const lower = mobileSearch.toLowerCase()
        result = result.filter(v => 
          v.wineries?.name?.toLowerCase().includes(lower) || 
          v.user_review?.toLowerCase().includes(lower)
        )
    }

    // Sort
    result.sort((a, b) => {
        let comparison = 0
        switch (sortField) {
            case "date":
                comparison = new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime()
                break
            case "rating":
                comparison = (a.rating || 0) - (b.rating || 0)
                break
            case "name":
                const nameA = a.wineries?.name || ""
                const nameB = b.wineries?.name || ""
                comparison = nameA.localeCompare(nameB)
                break
        }
        return sortDirection === "asc" ? comparison : -comparison
    })

    return result
  }, [visits, mobileSearch, sortField, sortDirection])

  return (
    <Dialog open={isVisitHistoryModalOpen} onOpenChange={setVisitHistoryModalOpen}>
      <DialogContent 
        className="max-w-4xl max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-6 pb-4 border-b bg-background z-10 flex items-start justify-between">
          <DialogHeader>
            <DialogTitle>Full Visit History</DialogTitle>
            <DialogDescription>
              A complete log of all your winery visits.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="-mt-2 -mr-2" onClick={() => setVisitHistoryModalOpen(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Mobile View: Card List */}
            <div className="md:hidden space-y-4">
                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search visits..."
                            value={mobileSearch}
                            onChange={(e) => setMobileSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase shrink-0">Sort By</span>
                            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="rating">Rating</SelectItem>
                                    <SelectItem value="name">Winery Name</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 w-8 px-0"
                            onClick={toggleSortDirection}
                        >
                            {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                <div className="space-y-3">
                    {isLoading && visits.length === 0 ? (
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredAndSortedVisits.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">No visits found.</p>
                    ) : (
                        filteredAndSortedVisits.map((visit) => (
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
                {hasMore && (
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationNext 
                                    href="#" 
                                    onClick={(e) => { e.preventDefault(); fetchVisits(page + 1); }} 
                                    aria-label="Load more visits"
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}
            </div>

            {/* Desktop View: Data Table */}
            <div className="hidden md:block">
                <div className="overflow-x-auto">
                    <DataTable columns={columns as any} data={visits} onRowClick={handleRowClick} />
                </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
