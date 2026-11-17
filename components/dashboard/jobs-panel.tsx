"use client";

import { useHpcJobs } from "@/hooks/use-jobs";
import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Briefcase, Rocket } from "lucide-react";
import Link from "next/link";
import { ownJobs } from "./panel-rules";

export function JobsPanel() {
  const { data, isLoading, error } = useHpcJobs();
  const { data: session } = useSession();
  const jobs = ownJobs<any>(data, (session?.user as any)?.username);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          <Briefcase className="inline-block w-4 h-4 mr-2" />
          My jobs in the queue
        </CardTitle>
        <Link href="/jobs" className="text-xs text-muted-foreground hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load jobs</p>
        )}
        {data && jobs.length === 0 && (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-sm text-muted-foreground">You have no jobs in the queue.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/compute"><Rocket className="mr-2 h-4 w-4" aria-hidden /> Start a job</Link>
            </Button>
          </div>
        )}
        {jobs.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.slice(0, 8).map((job) => (
                <TableRow key={job.jobId}>
                  <TableCell>
                    <Link href={`/job/${job.jobId}`} className="hover:underline">
                      <span className="block text-sm font-medium truncate max-w-[180px]">{job.name || job.jobId}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{job.jobId}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status || "Unknown"} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.queue || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
