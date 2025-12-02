"use client";
import { memo, useState } from "react";
import { Winery } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wine, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WinerySearchResultsProps {
  listResultsInView: Winery[];
  isSearching: boolean;
  handleOpenModal: (winery: Winery) => void;
}

const WinerySearchResults = memo(
  ({ listResultsInView, isSearching, handleOpenModal }: WinerySearchResultsProps) => {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <div className="space-y-4 transition-all duration-200 ease-in-out">
        <Card>
          <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
            <CardTitle className="flex justify-between items-center text-base">
              <div className="flex items-center gap-2">
                  <span>Results In View</span>
                  <Badge variant="secondary" className="text-xs">{listResultsInView.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </CardTitle>
          </CardHeader>
          {isOpen && (
            <CardContent className="relative px-2 pb-2">
                {isSearching && (
                <div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 flex items-center justify-center rounded-b-lg z-10">
                    <Loader2 className="animate-spin text-muted-foreground h-8 w-8" />
                </div>
                )}
                <div
                className="space-y-2 max-h-[450px] min-h-[200px] overflow-y-auto data-[loaded=true]:animate-in data-[loaded=true]:fade-in-50 px-2"
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
                        onClick={(e) => {
                             e.stopPropagation(); // Prevent closing the card when clicking an item
                             handleOpenModal(winery);
                        }}
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
          )}
        </Card>
      </div>
    );
  }
);

WinerySearchResults.displayName = "WinerySearchResults";

export default WinerySearchResults;