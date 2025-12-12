'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TripList from "@/components/trip-list"
import TripPlanner from "@/components/trip-planner"
import VisitHistoryView from "@/components/VisitHistoryView"
import { AuthenticatedUser } from "@/lib/types"

export default function TripsClientPage({ user }: { user: AuthenticatedUser }) {

  const handleWinerySelect = () => {
    
  }

  return (
    <Tabs defaultValue="trips">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="trips">My Trips</TabsTrigger>
        <TabsTrigger value="planner">Plan a Trip</TabsTrigger>
        <TabsTrigger value="history">Visit History</TabsTrigger>
      </TabsList>
      <TabsContent value="trips">
        <TripList />
      </TabsContent>
      <TabsContent value="planner">
        <TripPlanner initialDate={new Date()} user={user} />
      </TabsContent>
      <TabsContent value="history">
        <VisitHistoryView onWinerySelect={handleWinerySelect} />
      </TabsContent>
    </Tabs>
  )
}