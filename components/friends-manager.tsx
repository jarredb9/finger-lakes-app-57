"use client";
// components/friends-manager.tsx
import { useState, useEffect } from "react";
import { useFriendStore } from "@/lib/stores/friendStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, UserCheck, UserX, Loader2, UserMinus, X as XIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Friend } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function FriendsManager() {
  const { toast } = useToast();
  const { friends, friendRequests, sentRequests, fetchFriends, addFriend, acceptFriend, rejectFriend, removeFriend, isLoading, error } = useFriendStore();
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleAddFriend = async () => {
    if (!email) return;
    try {
      await addFriend(email);
      toast({ description: "Friend request sent!" });
      setEmail("");
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message || "Failed to send request." });
    }
  };

  const handleAccept = async (requesterId: string) => {
    try {
      await acceptFriend(requesterId);
      toast({ description: "Friend request accepted." });
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message || "Failed to accept request." });
    }
  };

  const handleReject = async (requesterId: string) => {
    try {
      await rejectFriend(requesterId);
      toast({ description: "Friend request rejected." });
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message || "Failed to reject request." });
    }
  };

  const handleRemove = async (friendId: string) => {
    try {
      await removeFriend(friendId);
      toast({ description: "Removed successfully." });
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message || "Failed to remove." });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a Friend</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            type="email"
            placeholder="Enter friend's email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={handleAddFriend} disabled={isLoading || !email.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Add</span>
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-red-500">{error}</p>}

      {friendRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Friend Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {friendRequests.map((req: Friend) => (
              <div key={req.id} className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
                <div>
                  <p className="font-medium">{req.name}</p>
                  <p className="text-sm text-gray-500">{req.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAccept(req.id)} disabled={isLoading}>
                    <UserCheck className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)} disabled={isLoading}>
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sentRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sent Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sentRequests.map((req: Friend) => (
              <div key={req.id} className="flex items-center justify-between p-2 bg-gray-100 rounded-md border border-dashed">
                <div>
                  <p className="font-medium">{req.name}</p>
                  <p className="text-sm text-gray-500">{req.email}</p>
                </div>
                <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleRemove(req.id)} 
                    disabled={isLoading}
                    className="text-muted-foreground hover:text-destructive"
                >
                    <span className="mr-2 text-xs">Cancel</span>
                    <XIcon className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My Friends</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {friends.length > 0 ? (
            friends.map((friend: Friend) => (
              <div key={friend.id} className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
                <div>
                    <p className="font-medium">{friend.name}</p>
                    <p className="text-sm text-gray-500">{friend.email}</p>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive/90 hover:bg-destructive/10">
                            <UserMinus className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Remove Friend?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to remove {friend.name} from your friends list? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(friend.id)} className="bg-destructive hover:bg-destructive/90">
                                Remove
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          ) : (
            <p className="text-gray-500">{"You haven't added any friends yet."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}