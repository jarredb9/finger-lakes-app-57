"use client";

import { Trip, TripMember } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from './ui/button';
import { ArrowRight, Trash2, Wine, Share2, Users, Calendar as CalendarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TripCardSimpleProps {
    trip: Trip;
    isOwner: boolean;
    currentMembers: TripMember[];
    onDelete: (tripId: number) => void;
    onShare: (id: string, name: string) => void;
    onExportToMaps: () => void;
}

export default function TripCardSimple({ 
    trip, 
    isOwner, 
    currentMembers, 
    onDelete,
    onShare,
    onExportToMaps
}: TripCardSimpleProps) {
    const router = useRouter();

    const handleViewTrip = (tripId: number) => {
        router.push(`/trips/${tripId}`);
    };

    return (
        <Card className="w-full relative group" data-testid="trip-card" data-trip-id={String(trip.id)}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg md:text-xl">{trip.name || "Unnamed Trip"}</CardTitle>
                     <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="outline" onClick={onExportToMaps} disabled={!trip.wineries || trip.wineries.length === 0}>
                                        <Share2 size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Export to Google Maps</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {isOwner && (
                            <>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                onClick={() => onShare(trip.id.toString(), trip.name || "Unnamed Trip")}
                                                data-testid="share-trip-btn"
                                                disabled={trip.id < 0}
                                            >
                                                <Users size={16} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Share Trip</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="icon" data-testid="delete-trip-btn" disabled={trip.id < 0}><Trash2 size={16} /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>This action will permanently delete this trip.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => onDelete(trip.id)} data-testid="confirm-delete-trip-btn">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                     </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <CalendarIcon size={16} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{new Date(trip.trip_date + 'T00:00:00').toLocaleDateString()}</p>
                    </div>
                    <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider" data-testid="trip-id-display">
                        ID: {trip.id > 0 ? trip.id : 'Pending'}
                    </div>
                </div>
                {currentMembers.length > 0 && (
                    <div className="flex items-center space-x-2 mt-2">
                        <Users size={16} className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Collaborators:</span>
                        <div className="flex items-center -space-x-2">
                            <TooltipProvider>
                                 {currentMembers.map((member) => (
                                      <Tooltip key={member.id}>
                                          <TooltipTrigger asChild>
                                              <Avatar className="h-6 w-6 border-2 border-white">
                                                <AvatarImage src={`https://i.pravatar.cc/150?u=${member.email}`} alt={member.name} />
                                                <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                              </Avatar>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                                <p>{member.name} ({member.role})</p>
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
                    <Button onClick={() => handleViewTrip(trip.id)} data-testid="view-trip-details-btn">View Details <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    <Badge variant="secondary"><Wine className="w-3 h-3 mr-1" /> {trip.wineries_count ?? trip.wineries?.length ?? 0} Wineries</Badge>
                </div>
            </CardContent>
        </Card>
    );
}
