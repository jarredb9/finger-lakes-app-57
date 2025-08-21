"use client"

import { useEffect, useState } from "react"
import { Visit } from "@/lib/types"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { Skeleton } from "@/components/ui/skeleton"

interface VisitHistoryProps {
    onWinerySelect: (wineryDbId: number) => void;
}

export default function VisitHistory({ onWinerySelect }: VisitHistoryProps) {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchVisits() {
            try {
                const response = await fetch('/api/visits');
                if (response.ok) {
                    const data = await response.json();
                    setVisits(data);
                }
            } catch (error) {
                console.error("Failed to fetch visit history", error);
            } finally {
                setLoading(false);
            }
        }
        fetchVisits();
    }, []);

    const handleRowClick = (visit: Visit) => {
        if (visit.wineries?.id) {
            onWinerySelect(visit.wineries.id);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Your Visit History</h1>
            <p className="text-muted-foreground mb-6">
                Here you can find all of your past winery visits. Click on a row to see more details.
            </p>
            <DataTable columns={columns} data={visits} onRowClick={handleRowClick} />
        </div>
    )
}