"use client";

import { useDbJobs, useHpcJobs } from "@/hooks/use-jobs";
import { isTerminal } from "@/lib/hpc/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Loader2,
  Monitor,
  Cpu,
  MemoryStick,
  Clock,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function InteractiveCard({ job, remote }: { job: any; remote?: boolean }) {
  const walltime = job.walltime || job.Resource_List?.walltime || "";
  const elapsedSec = job.elapsedTime || 0;

  // Parse walltime (HH:MM:SS)
  let totalSec = 0;
  if (walltime) {
    const parts = walltime.split(":").map(Number);
    if (parts.length === 3) totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const remainSec = Math.max(0, totalSec - elapsedSec);
  const pct = totalSec > 0 ? Math.round((elapsedSec / totalSec) * 100) : 0;

  const ncpus = job.ncpus || job.Resource_List?.ncpus || job.procs || "-";
  const mem = job.mem || job.Resource_List?.mem || "-";
  const jobId = job.jobId || job.Job_Id || job.id || "";
  const jobName = job.jobName || job.Job_Name || job.name || "Interactive";
  const startTime = job.startTime || job.stime || "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{jobName}</CardTitle>
          </div>
          <Badge variant="default" className="text-xs">
            {job.status || "Running"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            <span>CPUs: {ncpus}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MemoryStick className="h-3.5 w-3.5" />
            <span>Mem: {mem}</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <span>Job ID: {jobId}</span>
          {startTime && <span className="ml-4">Started: {startTime}</span>}
        </div>

        {totalSec > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Elapsed: {formatTime(elapsedSec)}
              </span>
              <span>Remaining: {formatTime(remainSec)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {job.workingDir && (
            <Link href="/storage/personal">
              <Button variant="outline" size="sm">
                <FolderOpen className="mr-1 h-3.5 w-3.5" />
                Working folder
              </Button>
            </Link>
          )}
          {remote && jobId && (
            <Link href={`/interactive/${encodeURIComponent(jobId)}/vnc`}>
              <Button size="sm">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Connect
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function InteractivePage() {
  const { data: jobs, isLoading, refetch, isFetching } = useHpcJobs();
  const { data: dbJobs, refetch: refetchDb } = useDbJobs();

  // Desktops submitted from the portal (type remote), merged with the scheduler's view,
  // then any other interactive scheduler jobs.
  const sessions = useMemo(() => {
    const live = Array.isArray(jobs) ? jobs : [];
    const byId = new Map(live.map((j: any) => [String(j.jobId ?? j.Job_Id ?? j.id), j]));
    const remote = (Array.isArray(dbJobs) ? dbJobs : [])
      .filter((d: any) => d.jobInfo?.jobArgs?.type === "remote" && !isTerminal(d.server?.status))
      .map((d: any) => ({
        remote: true,
        job: { ...byId.get(String(d.jobId)), jobId: d.jobId, jobName: d.jobInfo?.jobName, status: d.server?.status },
      }));
    const seen = new Set(remote.map((r) => String(r.job.jobId)));
    const other = live
      .filter(
        (j: any) =>
          !seen.has(String(j.jobId ?? j.Job_Id ?? j.id)) &&
          (j.interactive === true ||
            j.job_type === "interactive" ||
            j.Interactive === "True" ||
            (j.Job_Name || j.jobName || "").toLowerCase().includes("interactive"))
      )
      .map((job: any) => ({ remote: false, job }));
    return [...remote, ...other];
  }, [jobs, dbJobs]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Monitor}
        title="Interactive sessions"
        description="Remote desktops running on compute nodes, opened in your browser."
        actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); refetchDb(); }}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              No interactive sessions running
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map(({ job, remote }, i) => (
            <InteractiveCard key={job.jobId || job.Job_Id || i} job={job} remote={remote} />
          ))}
        </div>
      )}
    </div>
  );
}
