"use client";

import { Trip, TripMember } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from './ui/button';
import { ArrowRight, Trash2, Wine, Share2, Users, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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
    const isPending = trip.syncStatus === 'pending';

    const handleViewTrip = (tripId: number) => {
        router.push(`/trips/${tripId}`);
    };

    return (
        <Card 
            className={cn(
                "w-full relative group transition-opacity",
                isPending && "opacity-50"
            )} 
            data-testid="trip-card" 
            data-trip-id={String(trip.id)}
        >
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg md:text-xl">{trip.name || "Unnamed Trip"}</CardTitle>
                        {isPending && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200 animate-pulse flex items-center gap-1 h-5 text-[10px] px-1.5 py-0">
                                <Clock className="w-2.5 h-2.5" />
                                Syncing
                            </Badge>
                        )}
                    </div>
                     <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button 
                                        size="icon" 
                                        variant="outline" 
                                        onClick={onExportToMaps} 
                                        disabled={!trip.wineries || trip.wineries.length === 0}
                                        aria-label="Export to Google Maps"
                                    >
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
                                                disabled={trip.id < 0 || isPending}
                                                aria-label="Share Trip"
                                            >
                                                <Users size={16} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Share Trip</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button 
                                                variant="destructive" 
                                                size="icon" 
                                                onClick={() => onDelete(trip.id)}
                                                data-testid="delete-trip-btn" 
                                                disabled={trip.id < 0 || isPending}
                                                aria-label="Delete Trip"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Delete Trip</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
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
                        ID: {trip.id > 0 ? (isPending ? 'Syncing...' : trip.id) : 'Pending'}
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
                    <Button 
                        onClick={() => handleViewTrip(trip.id)} 
                        data-testid="view-trip-details-btn"
                        disabled={isPending}
                    >
                        View Details <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Badge variant="secondary"><Wine className="w-3 h-3 mr-1" /> {trip.wineries_count ?? trip.wineries?.length ?? 0} Wineries</Badge>
                </div>
            </CardContent>
        </Card>
    );
}
