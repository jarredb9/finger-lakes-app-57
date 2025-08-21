"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Visit } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"
import { Star } from "lucide-react"

export const columns: ColumnDef<Visit>[] = [
  {
    accessorKey: "wineries.name", 
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Winery
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const name = row.original.wineries?.name;
        return <div className="font-medium">{name}</div>
    },
  },
  {
    accessorKey: "visit_date",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        return new Date(row.original.visit_date + 'T00:00:00').toLocaleDateString()
    }
  },
  {
    accessorKey: "rating",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Rating
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const rating = row.original.rating;
        if (!rating) return <div className="text-muted-foreground">Unrated</div>

        return (
            <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                ))}
            </div>
        )
    }
  },
  {
    accessorKey: "user_review",
    header: "Review",
    cell: ({ row }) => {
        const review = row.original.user_review;
        return <div className="text-sm text-muted-foreground truncate max-w-xs">{review || "No review."}</div>
    }
  },
]