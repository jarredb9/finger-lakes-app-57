'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TripList from "@/components/trip-list"
import VisitHistoryView from "@/components/VisitHistoryView"
import { AuthenticatedUser, GooglePlaceId } from "@/lib/types"
import { useUIStore } from "@/lib/stores/uiStore"
import { useWineryStore } from "@/lib/stores/wineryStore"

export default function TripsClientPage({ user }: { user: AuthenticatedUser }) {
  const { openWineryModal } = useUIStore();
  const { ensureWineryDetails } = useWineryStore();

  const handleWinerySelect = (wineryId: string) => {
    ensureWineryDetails(wineryId as GooglePlaceId);
    openWineryModal(wineryId);
  }

  return (
    <Tabs defaultValue="trips">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="trips">My Trips</TabsTrigger>
        <TabsTrigger value="history">Visit History</TabsTrigger>
      </TabsList>
      <TabsContent value="trips">
        <TripList user={user} />
      </TabsContent>
      <TabsContent value="history">
        <VisitHistoryView onWinerySelect={handleWinerySelect} />
      </TabsContent>
    </Tabs>
  )
}