"use client";

import { use } from "react";
import { useDbJobInfo, useHpcJobs, useJobResiduals } from "@/hooks/use-jobs";
import { JobInfoCard } from "@/components/job-detail/job-info-card";
import { ResidualsChart } from "@/components/job-detail/residuals-chart";
import { OutputViewer } from "@/components/job-detail/output-viewer";
import { StatusTimeline } from "@/components/job-detail/status-timeline";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { CancelJobButton } from "@/components/jobs/job-actions";
import { canCancel } from "@/components/jobs/can-cancel";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, LineChart, RotateCcw, ScrollText } from "lucide-react";
import Link from "next/link";

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const { data: job, isLoading, error } = useDbJobInfo(jobId);
  const { data: session } = useSession();
  // Listing the queue also updates the stored status of finished jobs (compareJobInfo).
  const { data: queue } = useHpcJobs();
  const appName = job?.jobInfo?.jobArgs?.appName;
  const appDomain = job?.jobInfo?.jobArgs?.appDomain;
  // Same query as ResidualsChart (shared cache): decides whether the Progress tab exists.
  const residuals = useJobResiduals(job ? jobId : null, { appName, appDomain });
  const showProgress = !residuals.data?.noParser;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link href="/jobs">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to jobs
          </Button>
        </Link>
        <p className="text-destructive">Error loading job: {error.message}</p>
      </div>
    );
  }

  // Live queue status while the job is in the queue. An archived record may share a
  // reused job id with a newer job, so it never takes the live row.
  const live = job?.server?.status === "Archive" ? undefined : (queue ?? []).find((j: any) => String(j.jobId) === jobId);
  const status = live?.status || job?.server?.status || "Unknown";
  const jobName = job?.jobInfo?.jobArgs?.jobName;
  // Portal job records are fetched for the session user, so the job is theirs.
  const user = session?.user as any;
  const cancellable = canCancel({ username: user?.username, status }, user);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <Link href="/jobs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Jobs
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{jobName || `Job ${jobId}`}</h2>
              <JobStatusBadge status={status} />
            </div>
            {jobName && <p className="font-mono text-xs text-muted-foreground">{jobId}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cancellable && <CancelJobButton jobId={jobId} name={jobName} />}
          {appDomain && appName && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/compute/${encodeURIComponent(appDomain)}/${encodeURIComponent(appName)}/${job?.jobInfo?.jobArgs?.type === "remote" ? "remote" : "batch"}?from=${encodeURIComponent(jobId)}`}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Run again
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StatusTimeline currentStatus={status} />
        </CardContent>
      </Card>

      {job && <JobInfoCard job={job} />}

      <Tabs key={showProgress ? "p" : "o"} defaultValue={showProgress ? "progress" : "output"} className="space-y-4">
        <TabsList>
          {showProgress && (
            <TabsTrigger value="progress"><LineChart className="mr-1 h-4 w-4" aria-hidden /> Progress</TabsTrigger>
          )}
          <TabsTrigger value="output"><ScrollText className="mr-1 h-4 w-4" aria-hidden /> Output</TabsTrigger>
        </TabsList>

        {showProgress && (
          <TabsContent value="progress">
            <ResidualsChart jobId={jobId} appName={appName} appDomain={appDomain} />
          </TabsContent>
        )}

        <TabsContent value="output">
          <OutputViewer jobId={jobId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
