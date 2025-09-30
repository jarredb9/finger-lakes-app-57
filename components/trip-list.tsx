
import { useEffect, useState } from "react";
import { useTripStore } from "@/lib/stores/tripStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import TripCard from "./trip-card";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export default function TripList() {
  const { trips, isLoading, fetchTrips, page, hasMore } = useTripStore();
  const { wineries } = useWineryStore();
  const [sortBy, setSortBy] = useState("trip_date");
  const [sortOrder, setSortOrder] = useState("desc");

  useEffect(() => {
    fetchTrips(1, sortBy, sortOrder, true);
  }, [fetchTrips, sortBy, sortOrder]);

  const handleLoadMore = () => {
    if (hasMore) {
      fetchTrips(page + 1, sortBy, sortOrder);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">My Trips</h2>
        <div className="flex items-center gap-2">
          <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
            const [sort, order] = value.split('-');
            setSortBy(sort);
            setSortOrder(order);
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trip_date-desc">Date (Newest First)</SelectItem>
              <SelectItem value="trip_date-asc">Date (Oldest First)</SelectItem>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading && trips.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : trips.length > 0 ? (
        <div className="space-y-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} allWineries={wineries} />
          ))}
        </div>
      ) : (
        <p>{"You haven't created any trips yet."}</p>
      )}
      {hasMore && (
        <div className="text-center">
          <Button onClick={handleLoadMore} disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</> : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
