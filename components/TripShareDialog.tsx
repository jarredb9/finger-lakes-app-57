"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useFriendStore } from "@/lib/stores/friendStore"
import { useUserStore } from "@/lib/stores/userStore"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { TripService } from "@/lib/services/tripService"
import { useToast } from "@/hooks/use-toast"
import { TripMembersList } from "./TripMembersList"
import { TripMember } from "@/lib/types"

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
  tripId,
}: TripShareDialogProps) {
  const { friends = [], fetchFriends, isLoading: isStoreLoading } = useFriendStore()
  const { user } = useUserStore()
  const { toast } = useToast()
  const [inviteEmail, setInviteEmail] = useState("")
  const [isInviting, setIsInviting] = useState<string | null>(null) // null or the email/id being invited
  const [members, setMembers] = useState<TripMember[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const hasFetchedRef = useRef(false);

  const fetchTripMembers = useCallback(async () => {
    if (!tripId) return
    setIsLoadingMembers(true)
    try {
      const trip = await TripService.getTripById(tripId)
      setMembers(trip.members || [])
    } catch (err) {
      console.error("fetchTripMembers Error:", err)
    } finally {
      setIsLoadingMembers(false)
    }
  }, [tripId])

  useEffect(() => {
    if (isOpen) {
      if (!hasFetchedRef.current) {
        fetchFriends()
        hasFetchedRef.current = true;
      }
      fetchTripMembers()
    } else {
      hasFetchedRef.current = false;
    }
  }, [isOpen, fetchFriends, fetchTripMembers, tripId])

  const handleInvite = async (email: string) => {
    const trimmedEmail = email.trim()
    setIsInviting(trimmedEmail)
    try {
      await TripService.addMemberByEmail(parseInt(tripId), trimmedEmail)
      toast({
        description: `Invitation sent to ${trimmedEmail}`,
      })
      // Refresh members list
      await fetchTripMembers()
      // If we invited the email from the manual input, clear it
      if (trimmedEmail.toLowerCase() === inviteEmail.trim().toLowerCase()) {
        setInviteEmail("")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Invitation Failed",
        description: error.message || "Failed to send invitation.",
      })
    } finally {
      setIsInviting(null)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      await TripService.removeMember(parseInt(tripId), userId)
      toast({ description: "Member removed from trip." })
      await fetchTripMembers()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Removal Failed",
        description: error.message || "Failed to remove member.",
      })
    }
  }

  const isOwner = members.find(m => m.id === user?.id)?.role === 'owner'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90dvh]" data-testid="trip-share-dialog">
        <DialogHeader>
          <DialogTitle>Collaborate on &quot;{tripName}&quot;</DialogTitle>
          <DialogDescription>
            Invite friends to plan this trip together.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-1 py-2 space-y-6">
          {/* Current Members Section */}
          <div className="min-h-0">
            {isLoadingMembers ? (
              <div className="flex justify-center items-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <TripMembersList 
                members={members} 
                isOwner={isOwner}
                currentUserId={user?.id}
                onRemove={handleRemoveMember}
              />
            )}
          </div>

          {/* Friends Section */}
          <div className="space-y-3 pt-2 border-t">
            <h4 className="text-sm font-medium px-1">Your Friends</h4>
            <div className="space-y-2">
              {isStoreLoading && friends.length === 0 ? (
                <div className="flex justify-center items-center py-4" data-testid="loading-friends">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : friends.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center bg-muted/20 rounded-md italic" data-testid="no-friends-msg">No friends found.</p>
              ) : (
                <div className="space-y-2">
                  {friends
                    .filter(f => !members.some(m => String(m.id).toLowerCase() === String(f.id).toLowerCase()))
                    .map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-muted-foreground/10"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} alt={friend.name || friend.email} />
                          <AvatarFallback>
                            {(friend.name || friend.email).substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{friend.name || friend.email}</span>
                          {friend.name && <span className="text-[10px] text-muted-foreground">{friend.email}</span>}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => handleInvite(friend.email)}
                        disabled={!!isInviting}
                        data-testid={`invite-friend-${friend.email}`}
                      >
                        {isInviting === friend.email ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Invite"
                        )}
                      </Button>
                    </div>
                  ))}
                  {friends.length > 0 && friends.every(f => members.some(m => String(m.id).toLowerCase() === String(f.id).toLowerCase())) && (
                    <p className="text-xs text-muted-foreground py-2 text-center italic" data-testid="all-friends-invited-msg">All your friends are already in this trip.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Email Invite Section */}
          <div className="space-y-3 pt-2 border-t">
            <h4 className="text-sm font-medium px-1">Invite by Email</h4>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="friend@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={!!isInviting}
                className="h-9 text-sm"
                data-testid="invite-email-input"
              />
              <Button 
                size="sm"
                onClick={() => handleInvite(inviteEmail)} 
                disabled={!inviteEmail.trim() || !!isInviting}
                data-testid="invite-by-email-btn"
                className="h-9 px-3 shrink-0"
              >
                {isInviting === inviteEmail && inviteEmail !== "" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Invite"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
