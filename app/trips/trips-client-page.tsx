'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TripList from "@/components/trip-list"
import TripPlanner from "@/components/trip-planner"
import VisitHistory from "@/components/visit-history"
import { User } from "@supabase/supabase-js"

export default function TripsClientPage({ user }: { user: User }) {

  const handleWinerySelect = (wineryDbId: number) => {
    // This function will need to be implemented to show the winery details.
    // For now, it will just log the ID.
    console.log("Winery selected:", wineryDbId)
  }

  return (
    <Tabs defaultValue="upcoming">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="upcoming">Upcoming Trips</TabsTrigger>
        <TabsTrigger value="past">Past Trips</TabsTrigger>
        <TabsTrigger value="planner">Plan a Trip</TabsTrigger>
        <TabsTrigger value="history">Visit History</TabsTrigger>
      </TabsList>
      <TabsContent value="upcoming">
        <TripList type="upcoming" />
      </TabsContent>
      <TabsContent value="past">
        <TripList type="past" />
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