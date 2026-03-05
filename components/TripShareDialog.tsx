"use client"

import { useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useFriendStore } from "@/lib/stores/friendStore"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

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
  const { friends = [], fetchFriends, isLoading } = useFriendStore()

  useEffect(() => {
    if (isOpen) {
      fetchFriends()
    }
  }, [isOpen, fetchFriends])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[85dvh]">
        <DialogHeader>
          <DialogTitle>Share &quot;{tripName}&quot;</DialogTitle>
          <DialogDescription>
            Invite friends to collaborate on this trip.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          <div className="space-y-2 flex flex-col min-h-0">
            <h4 className="text-sm font-medium shrink-0">Your Friends</h4>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 min-h-0">
              {isLoading && friends.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading friends...</p>
              ) : friends.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No friends found.</p>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={undefined} alt={friend.name || friend.email} />
                          <AvatarFallback>
                            {(friend.name || friend.email).substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{friend.name || friend.email}</span>
                          {friend.name && <span className="text-xs text-muted-foreground">{friend.email}</span>}
                        </div>
                      </div>
                      <Button size="sm" variant="secondary">
                        Invite
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t shrink-0">
            <h4 className="text-sm font-medium">Invite by Email</h4>
            <p className="text-sm text-muted-foreground">
              Email invitation input will be added in Task 3.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
