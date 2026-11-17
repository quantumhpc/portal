"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobTable, type HpcJob } from "@/components/jobs/job-table";
import { useHpcJobs, useDbJobs, useDeleteDbJob } from "@/hooks/use-jobs";
import { useAppInfo } from "@/hooks/use-cluster";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { CancelJobButton } from "@/components/jobs/job-actions";
import { canCancel } from "@/components/jobs/can-cancel";
import { useSession } from "next-auth/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AppIcon } from "@/components/compute/app-icon";
import { Boxes, CircleX, ListX, Loader2, Monitor, Rocket, RotateCcw, Search, User, Users } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useMemo, useState } from "react";

/** Live queue row of a portal job; archived records may share a reused job id, so they never match. */
function liveRow(job: any, live: Map<string, HpcJob>): HpcJob | undefined {
  return job.server?.status === "Archive" ? undefined : live.get(String(job.jobId));
}

function MyJobsTable({ live }: { live: Map<string, HpcJob> }) {
  const { data: jobs, isLoading } = useDbJobs();
  const { data: info } = useAppInfo();
  const deleteJob = useDeleteDbJob();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");

  const handleDelete = (jobId: string) => {
    deleteJob.mutate(jobId, {
      onSuccess: () => toast.success(`Job ${jobId} removed from the list`),
      onError: (err) => toast.error(err.message),
    });
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!jobs || jobs.length === 0) {
    return (
      <EmptyState
        icon={Rocket}
        title="No jobs submitted from the portal yet"
        description="Pick an application to start your first job."
        action={<Button asChild size="sm" className="mt-2"><Link href="/compute"><Rocket className="mr-2 h-4 w-4" /> Start a job</Link></Button>}
      />
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? jobs.filter((job: any) => {
        const args = job.jobInfo?.jobArgs ?? {};
        const app = info?.appList?.[args.appDomain]?.[args.appName];
        return [job.jobId, args.jobName, args.appName, app?.name].some((v) => String(v ?? "").toLowerCase().includes(needle));
      })
    : jobs;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          aria-label="Search my jobs"
          placeholder="Search by name, id or application"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Application</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Elapsed</TableHead>
              <TableHead>Cores</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Type</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((job: any) => {
              const args = job.jobInfo?.jobArgs ?? {};
              const app = info?.appList?.[args.appDomain]?.[args.appName];
              const remote = args.type === "remote";
              const q = liveRow(job, live);
              return (
                <TableRow key={String(job._id ?? job.jobId)}>
                  <TableCell>
                    <Link href={`/job/${job.jobId}`} className="hover:underline">
                      <span className="block text-sm font-medium">{args.jobName || job.jobId}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{job.jobId}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center gap-2">
                      <AppIcon logo={app?.logo} size={20} />
                      {app?.name || args.appName || "-"}
                    </span>
                  </TableCell>
                  <TableCell><JobStatusBadge status={q?.status || job.server?.status || "Unknown"} /></TableCell>
                  <TableCell className="font-mono text-xs">{q?.elapsedtime || "-"}</TableCell>
                  <TableCell className="text-sm">{q?.procs || args.numProcs || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {job.jobInfo?.jobDate ? new Date(job.jobInfo.jobDate).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {remote ? <Monitor className="h-3.5 w-3.5" aria-hidden /> : <Boxes className="h-3.5 w-3.5" aria-hidden />}
                      {remote ? "Remote desktop" : "Batch"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {args.appDomain && args.appName && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Run again with the same values">
                        <Link
                          href={`/compute/${encodeURIComponent(args.appDomain)}/${encodeURIComponent(args.appName)}/${remote ? "remote" : "batch"}?from=${encodeURIComponent(job.jobId)}`}
                          aria-label={`Run job ${job.jobId} again`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                    {canCancel(q, session?.user as any) && (
                      <CancelJobButton
                        jobId={String(job.jobId)}
                        name={args.jobName}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Cancel job ${job.jobId}`} title="Cancel the job">
                            <CircleX className="h-4 w-4" />
                          </Button>
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remove job ${job.jobId} from the list`}
                      title="Remove from the list (does not cancel the job)"
                      onClick={() => handleDelete(job.jobId)}
                    >
                      <ListX className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {shown.length} {shown.length === 1 ? "job" : "jobs"}
      </p>
    </div>
  );
}

export default function JobsPage() {
  const { data: hpcJobs, isLoading: hpcLoading } = useHpcJobs();
  const { data: dbJobs } = useDbJobs();
  const { data: info } = useAppInfo();

  // Join the scheduler queue (live state) with the portal's records (app, inputs) on job id.
  const live = useMemo(
    () => new Map<string, HpcJob>((hpcJobs ?? []).map((j: HpcJob) => [String(j.jobId), j])),
    [hpcJobs],
  );
  const queueRows = useMemo(() => {
    const portal = new Map<string, any>();
    for (const job of dbJobs ?? []) if (liveRow(job, live) && !portal.has(String(job.jobId))) portal.set(String(job.jobId), job);
    return (hpcJobs ?? []).map((j: HpcJob) => {
      const args = portal.get(String(j.jobId))?.jobInfo?.jobArgs;
      const app = args && info?.appList?.[args.appDomain]?.[args.appName];
      return args ? { ...j, appName: app?.name || args.appName, appLogo: app?.logo } : j;
    });
  }, [hpcJobs, dbJobs, info, live]);

  return (
    <div className="space-y-6">
      <PageHeader icon={Boxes} title="Jobs" description="Jobs you started from the portal, and everything in the scheduler queue." />

      <Tabs defaultValue="mine" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mine"><User className="mr-1 h-4 w-4" aria-hidden /> My submissions</TabsTrigger>
          <TabsTrigger value="all"><Users className="mr-1 h-4 w-4" aria-hidden /> All cluster jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          <MyJobsTable live={live} />
        </TabsContent>

        <TabsContent value="all">
          <JobTable data={queueRows} isLoading={hpcLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
