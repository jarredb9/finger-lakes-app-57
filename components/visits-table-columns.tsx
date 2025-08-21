"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Visit } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, MoreHorizontal, Eye } from "lucide-react"
import { Star } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// The columns definition is now a function that accepts the handler
export const columns = (onWinerySelect: (wineryDbId: number) => void): ColumnDef<Visit>[] => [
  {
    accessorKey: "winery_name",
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
    filterFn: (row, id, value) => {
        const review = row.original.user_review || "";
        const name = row.original.wineries?.name || "";
        return name.toLowerCase().includes(value.toLowerCase()) || review.toLowerCase().includes(value.toLowerCase());
    }
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
  {
    id: "actions",
    cell: ({ row }) => {
      const visit = row.original
 
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onWinerySelect(visit.wineries!.id)}>
              <Eye className="mr-2 h-4 w-4" />
              View All Visits
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]