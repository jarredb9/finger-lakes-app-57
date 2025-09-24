"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Friend } from '@/lib/types';
import { useFriendStore } from '@/lib/stores/friendStore'; // Import the new store
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserPlus, Check, X, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";




interface FriendsManagerProps {
  userId: string;
}

export default function FriendsManager({ userId }: FriendsManagerProps) {
  // Get state and actions from the friend store
  const { friends, requests, isLoading, fetchFriends, addFriend, respondToRequest } = useFriendStore();
  const [email, setEmail] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await addFriend(email);
      toast({ description: 'Friend request sent.' });
      setEmail('');
    } catch (error: Error) {
      toast({ variant: 'destructive', description: error.message });
    }
  };

  const handleFriendRequest = async (requesterId: string, accept: boolean) => {
    try {
      await respondToRequest(requesterId, accept);
      toast({ description: `Friend request ${accept ? 'accepted' : 'declined'}.` });
    } catch (error: Error) {
      toast({ variant: 'destructive', description: error.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Friends</CardTitle>
        <CardDescription>Connect with other winery enthusiasts.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="friends">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="friends">My Friends</TabsTrigger>
            <TabsTrigger value="requests" disabled={isLoading}>
              Friend Requests {requests.length > 0 && `(${requests.length})`}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="friends" className="mt-4">
            <form onSubmit={handleAddFriend} className="flex items-center gap-2 mb-4">
              <Input
                type="email"
                placeholder="Enter friend's email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-grow"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" size="icon">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add Friend</p>
                </TooltipContent>
              </Tooltip>
            </form>
            <div className="space-y-2">
              {isLoading ? <p>Loading...</p> : friends.map(friend => (
                <div key={friend.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} />
                      <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{friend.name}</p>
                      <p className="text-sm text-muted-foreground">{friend.email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="requests" className="mt-4">
            <div className="space-y-2">
              {isLoading ? <p>Loading...</p> : requests.map(request => (
                <div key={request.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Avatar>
                      <AvatarImage src={`https://i.pravatar.cc/150?u=${request.email}`} />
                      <AvatarFallback>{request.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{request.name}</p>
                      <p className="text-sm text-muted-foreground">{request.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="outline" onClick={() => handleFriendRequest(request.id, true)}>
                          <Check className="h-4 w-4 text-green-500" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Accept Request</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="outline" onClick={() => handleFriendRequest(request.id, false)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Decline Request</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}