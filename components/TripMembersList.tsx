"use client"

import { TripMember } from "@/lib/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Shield, User } from "lucide-react"

interface TripMembersListProps {
  members: TripMember[]
}

export function TripMembersList({ members }: TripMembersListProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium px-1">Trip Participants</h4>
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-muted-foreground/10"
          >
            <div className="flex items-center space-x-3">
              <Avatar className="h-9 w-9 border border-background shadow-sm">
                <AvatarImage src={`https://i.pravatar.cc/150?u=${member.email}`} alt={member.name} />
                <AvatarFallback>
                  {member.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{member.name}</span>
                  {member.role === 'owner' ? (
                    <Badge variant="default" className="h-4 px-1.5 text-[10px] uppercase font-bold bg-blue-600 hover:bg-blue-600">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      Owner
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] uppercase font-bold">
                      <User className="w-2.5 h-2.5 mr-1" />
                      Member
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{member.email}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
               {member.status === 'invited' && (
                 <Badge variant="outline" className="text-[10px] animate-pulse">Pending</Badge>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
