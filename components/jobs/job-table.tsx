"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { JobStatusBadge } from "./job-status-badge";
import { JobActions } from "./job-actions";
import { ArrowUpDown, Search, ListOrdered, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AppIcon } from "@/components/compute/app-icon";

/** A scheduler queue row (lib/hpc/formatter.ts), plus app info for jobs started from the portal. */
export interface HpcJob {
  jobId: string;
  name: string;
  status: string;
  queue: string;
  username: string;
  procs?: string;
  elapsedtime?: string;
  appName?: string;
  appLogo?: string;
}

const columns: ColumnDef<HpcJob>[] = [
  {
    accessorKey: "jobId",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Job ID <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <Link href={`/job/${row.original.jobId}`} className="font-mono text-xs hover:underline">
        {row.original.jobId}
      </Link>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="truncate max-w-[160px] block">{row.original.name || "-"}</span>
    ),
  },
  {
    accessorKey: "appName",
    header: "Application",
    cell: ({ row }) =>
      row.original.appName ? (
        <span className="inline-flex items-center gap-2">
          <AppIcon logo={row.original.appLogo} size={20} /> {row.original.appName}
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "queue",
    header: "Queue",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {row.original.queue || "-"}
      </span>
    ),
  },
  {
    accessorKey: "username",
    header: "Owner",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {row.original.username || "-"}
      </span>
    ),
  },
  {
    accessorKey: "procs",
    header: "Cores",
  },
  {
    accessorKey: "elapsedtime",
    header: "Elapsed",
  },
  {
    id: "actions",
    cell: ({ row }) => <JobActions jobId={row.original.jobId} name={row.original.name} status={row.original.status} username={row.original.username} />,
  },
];

export function JobTable({ data, isLoading }: { data: HpcJob[]; isLoading: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data: data || [],
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search jobs"
          placeholder="Search jobs..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  Loading jobs...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  No jobs found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {table.getFilteredRowModel().rows.length} {table.getFilteredRowModel().rows.length === 1 ? "job" : "jobs"}
      </p>
    </div>
  );
}
