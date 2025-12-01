"use client";

import { Trip } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from './ui/button';
import { ArrowRight, Trash2, Wine, Share2, UserPlus, Check, Users, Calendar as CalendarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useTripActions } from "@/hooks/use-trip-actions";

interface TripCardSimpleProps {
    trip: Trip;
    onDelete: (tripId: number) => void;
}

export default function TripCardSimple({ trip, onDelete }: TripCardSimpleProps) {
    const router = useRouter();
    
    const { 
        friends, 
        selectedFriends, 
        currentMembers, 
        handleExportToMaps, 
        toggleFriendSelection, 
        saveTripMembers 
    } = useTripActions(trip);

    const handleViewTrip = (tripId: number) => {
        router.push(`/trips/${tripId}`);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg md:text-xl">{trip.name || "Unnamed Trip"}</CardTitle>
                     <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="outline" onClick={handleExportToMaps} disabled={!trip.wineries || trip.wineries.length === 0}>
                                        <Share2 size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Export to Google Maps</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon"><UserPlus size={16} /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0">
                            <Command>
                              <CommandInput placeholder="Search friends..." className="h-9" />
                              <CommandEmpty>No friends found.</CommandEmpty>
                              <CommandGroup>
                                {friends.map((friend) => (
                                  <CommandItem
                                    key={friend.id}
                                    onSelect={() => toggleFriendSelection(friend.id)}
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
                            <Button className="w-full" onClick={() => saveTripMembers()}>Update Members</Button>
                          </PopoverContent>
                        </Popover>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon"><Trash2 size={16} /></Button>
                            </AlertDialogTrigger>
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
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <CalendarIcon size={16} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</p>
                    </div>
                </div>
                {currentMembers.length > 0 && (
                    <div className="flex items-center space-x-2 mt-2">
                        <Users size={16} className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Collaborators:</span>
                        <div className="flex items-center -space-x-2">
                            <TooltipProvider>
                                 {currentMembers.map((friend) => (
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
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="flex justify-between items-center">
                    <Button onClick={() => handleViewTrip(trip.id)}>View Details <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    <Badge variant="secondary"><Wine className="w-3 h-3 mr-1" /> {trip.wineries?.length || 0} Wineries</Badge>
                </div>
            </CardContent>
        </Card>
    );
}