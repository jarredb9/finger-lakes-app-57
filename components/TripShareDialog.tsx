"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface TripShareDialogProps {
  isOpen: boolean
  onClose: () => void
  tripName: string
  tripId: string
}

export function TripShareDialog({
  isOpen,
  onClose,
  tripName,
}: TripShareDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &quot;{tripName}&quot;</DialogTitle>
          <DialogDescription>
            Invite friends to collaborate on this trip.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          {/* Content for Task 2 & 3 will go here */}
          <p className="text-sm text-muted-foreground">
            Friend selection and email invitation will be implemented in the next tasks.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
