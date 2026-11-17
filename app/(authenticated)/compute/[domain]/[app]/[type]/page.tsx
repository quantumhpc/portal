"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { JobForm } from "@/components/compute/job-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import type { JobArgs } from "@/lib/hpc/job-template";

/** Form values to start from: a past job (?from=<jobId>) or a saved run (?saved=<id>). */
function useInitialValues(): { initial?: JobArgs; label?: string; isLoading: boolean; error?: Error | null } {
  const search = useSearchParams();
  const from = search.get("from");
  const saved = search.get("saved");
  const q = useQuery({
    queryKey: ["form-seed", from, saved],
    enabled: !!(from || saved),
    queryFn: async () => {
      if (saved) {
        const run = await fetchJson(`/api/saved-runs?id=${encodeURIComponent(saved)}`);
        return { initial: run.jobArgs as JobArgs, label: `your saved set-up "${run.name}"` };
      }
      const job = await fetchJson(`/api/jobs?action=info&jobId=${encodeURIComponent(from!)}`);
      if (!job) throw new Error(`Job ${from} is not in your submissions`);
      return { initial: job.jobInfo?.jobArgs as JobArgs, label: `job ${from}` };
    },
  });
  return { ...q.data, isLoading: q.isLoading, error: q.error };
}

export default function JobSubmissionPage({
  params,
}: {
  params: Promise<{ domain: string; app: string; type: string }>;
}) {
  const { domain, app, type } = use(params);
  const seed = useInitialValues();

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Link href="/compute">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Applications
          </Button>
        </Link>
        <h2 className="text-2xl font-bold">
          Submit: {decodeURIComponent(app)}
        </h2>
      </div>
      {seed.isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : seed.error ? (
        <p className="text-sm text-destructive">{seed.error.message}</p>
      ) : (
        <JobForm
          domain={decodeURIComponent(domain)}
          appName={decodeURIComponent(app)}
          appType={decodeURIComponent(type)}
          initial={seed.initial}
          initialLabel={seed.label}
        />
      )}
    </div>
  );
}
