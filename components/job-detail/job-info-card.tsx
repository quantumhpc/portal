"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface JobInfoCardProps {
  job: any;
}

export function JobInfoCard({ job }: JobInfoCardProps) {
  const info = job?.jobInfo || {};
  const server = job?.server || {};
  const args = info.jobArgs || {};

  const fields = [
    { label: "Job ID", value: job?.jobId },
    { label: "Application", value: args.appName },
    { label: "Domain", value: args.appDomain },
    { label: "Type", value: args.type },
    { label: "Queue", value: server.queue || args.queue },
    { label: "Owner", value: server.username || info.username },
    { label: "Processors", value: args.procs || args.numProcs || server.procs },
    { label: "Submitted", value: info.jobDate ? new Date(info.jobDate).toLocaleString() : "-" },
    { label: "Working folder", value: info.mountedWorkingDir || args.workdir },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Job information</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {fields.map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium truncate">{value || "-"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
