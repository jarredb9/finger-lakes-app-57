"use client";

import { useState, useEffect } from 'react';
import { Trip, Winery, Friend } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from './ui/button';
import { ArrowRight, Trash2, Wine, Share2, UserPlus, Check, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTripStore } from '@/lib/stores/tripStore';
import { useFriendStore } from '@/lib/stores/friendStore';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface TripCardSimpleProps {
    trip: Trip;
    onDelete: (tripId: number) => void;
}

export default function TripCardSimple({ trip, onDelete }: TripCardSimpleProps) {
    const router = useRouter();
    const { toast } = useToast();
    const { addMembersToTrip } = useTripStore();
    const { friends, fetchFriends } = useFriendStore();
    const [selectedFriends, setSelectedFriends] = useState<string[]>(trip.members || []);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    const handleViewTrip = (tripId: number) => {
        router.push(`/trips/${tripId}`);
    };

    const handleExportToMaps = (tripWineries: Winery[]) => {
        if (!tripWineries || tripWineries.length === 0) {
            return;
        }

        const encodedWineries = tripWineries.map(w => encodeURIComponent(`${w.name}, ${w.address}`));
        
        let url = `https://www.google.com/maps/dir/Current+Location/`;

        if (encodedWineries.length === 1) {
            url += `${encodedWineries[0]}`;
        } else {
            const waypoints = encodedWineries.join('/');
            url += `${waypoints}`;
        }
        
        window.open(url, '_blank');
    };

    const handleAddFriendsToTrip = async () => {
        try {
            await addMembersToTrip(trip.id.toString(), selectedFriends);
            toast({ description: "Trip members updated." });
        } catch (error) {
            toast({ variant: "destructive", description: "Failed to update trip members." });
        }
    };

    const onFriendSelect = (friendId: string) => {
        setSelectedFriends(prev => 
          prev.includes(friendId) 
            ? prev.filter(id => id !== friendId) 
            : [...prev, friendId]
        );
    };

    const currentMembers = friends.filter((f: Friend) => trip.members?.includes(f.id));

    return (
        <Card>
            <CardHeader className="relative">
                <CardTitle className="text-lg">{trip.name || `Trip for ${new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}`}</CardTitle>
                <CardDescription>{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</CardDescription>
                <Badge variant="secondary" className="absolute top-4 right-4"><Wine className="w-3 h-3 mr-1" /> {trip.wineries?.length || 0} Wineries</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                    <Button onClick={() => handleViewTrip(trip.id)}>View Details <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="outline" onClick={() => handleExportToMaps(trip.wineries)} disabled={!trip.wineries || trip.wineries.length === 0}>
                                        <Share2 size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Export to Google Maps</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="destructive" size="icon"><Trash2 size={16} /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>This action will permanently delete this trip.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(trip.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4" />
                    <div className="flex items-center -space-x-2">
                        <TooltipProvider>
                            {currentMembers.map((friend: Friend) => (
                                <Tooltip key={friend.id}>
                                    <TooltipTrigger asChild>
                                        <Avatar className="h-6 w-6 border-2 border-white">
                                            <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} alt={friend.name} />
                                            <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{friend.name}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </TooltipProvider>
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm"><UserPlus className="w-4 h-4 mr-2"/>Add/Remove</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0">
                            <Command>
                                <CommandInput placeholder="Search friends..." className="h-9" />
                                <CommandEmpty>No friends found.</CommandEmpty>
                                <CommandGroup>
                                    {friends.map((friend: Friend) => (
                                    <CommandItem
                                        key={friend.id}
                                        onSelect={() => onFriendSelect(friend.id)}
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <span>{friend.name}</span>
                                            <Check
                                                className={cn(
                                                "h-4 w-4",
                                                selectedFriends.includes(friend.id) ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                        </div>
                                    </CommandItem>
                                    ))}
                                </CommandGroup>
                            </Command>
                            <Button className="w-full" onClick={handleAddFriendsToTrip}>Update Members</Button>
                        </PopoverContent>
                    </Popover>
                </div>
            </CardContent>
        </Card>
    );
}
