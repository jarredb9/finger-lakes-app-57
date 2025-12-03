"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { Visit } from "@/lib/types"
import { useUIStore } from "@/lib/stores/uiStore"

interface VisitHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  visits: Visit[]
}

export function VisitHistoryModal({ isOpen, onClose, visits }: VisitHistoryModalProps) {
  const { openWineryModal } = useUIStore()

  const handleRowClick = (visit: Visit) => {
     // @ts-ignore - We know this visit object has the wineryId attached from the parent mapping
     if (visit.wineryId) {
        // @ts-ignore
        openWineryModal(visit.wineryId)
        onClose()
     }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Full Visit History</DialogTitle>
          <DialogDescription>
            A complete log of all your winery visits. Click a row to view winery details.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={visits} onRowClick={handleRowClick} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
