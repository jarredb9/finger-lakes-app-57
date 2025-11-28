"use client";
import { Winery } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wine } from "lucide-react";

interface WinerySearchResultsProps {
  listResultsInView: Winery[];
  isSearching: boolean;
  handleOpenModal: (winery: Winery) => void;
}

const WinerySearchResults = memo(
  ({ listResultsInView, isSearching, handleOpenModal }: WinerySearchResultsProps) => {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Results In View <Badge>{listResultsInView.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {isSearching && (
              <div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 flex items-center justify-center rounded-b-lg z-10">
                <Loader2 className="animate-spin text-muted-foreground h-8 w-8" />
              </div>
            )}
            <div
              className="space-y-2 max-h-[450px] min-h-[400px] overflow-y-auto data-[loaded=true]:animate-in data-[loaded=true]:fade-in-50"
              data-loaded={!isSearching}
            >
              {listResultsInView.length === 0 && !isSearching && (
                <div className="text-center pt-10 text-muted-foreground">
                  <Wine className="mx-auto h-12 w-12" />
                  <p className="mt-4 text-sm">No wineries found.</p>
                  <p className="text-xs">
                    Try searching or adjusting your filter.
                  </p>
                </div>
              )}
              {!isSearching &&
                listResultsInView.map((winery) => (
                  <div
                    key={winery.id}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted hover:shadow-md hover:scale-[1.02] transition-all duration-200"
                    onClick={() => handleOpenModal(winery)}
                  >
                    <p className="font-medium text-sm">{winery.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {winery.address}
                    </p>
                    {winery.rating && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ★ {winery.rating}/5.0
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
);

WinerySearchResults.displayName = "WinerySearchResults";

export default WinerySearchResults;