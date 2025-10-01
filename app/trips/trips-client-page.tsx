'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TripList from "@/components/trip-list"
import TripPlanner from "@/components/trip-planner"
import VisitHistory from "@/components/visit-history"
import { AuthenticatedUser } from "@/lib/types"
import { useTripStore } from "@/lib/stores/tripStore"

export default function TripsClientPage({ user }: { user: AuthenticatedUser }) {
  const { fetchAllTrips } = useTripStore();

  const handleWinerySelect = () => {
    
  }

  const onTabChange = (value: string) => {
    if (value === 'trips') {
      fetchAllTrips();
    }
  }

  return (
    <Tabs defaultValue="trips" onValueChange={onTabChange}>
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
        <VisitHistory onWinerySelect={handleWinerySelect} />
      </TabsContent>
    </Tabs>
  )
}