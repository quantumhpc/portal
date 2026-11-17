"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";


/** HPC scheduler job list */
export function useHpcJobs() {
  return useQuery({
    queryKey: ["hpc-jobs"],
    queryFn: () => fetchJson("/api/manager/jobs?action=list"),
    refetchInterval: 15000,
  });
}

/** App database job list */
export function useDbJobs() {
  return useQuery({
    queryKey: ["db-jobs"],
    queryFn: () => fetchJson("/api/jobs?action=list"),
    refetchInterval: 15000,
  });
}

/** Job info from DB */
export function useDbJobInfo(jobId: string | null) {
  return useQuery({
    queryKey: ["db-job", jobId],
    queryFn: () => fetchJson(`/api/jobs?action=info&jobId=${jobId}`),
    enabled: !!jobId,
    // Until the job has left the queue, its stored status can still change.
    refetchInterval: (q) => ((q.state.data as { server?: { status?: string } } | undefined)?.server?.status === "Archive" ? false : 10000),
  });
}

/** Job residuals */
export function useJobResiduals(
  jobId: string | null,
  opts?: { appName?: string; appDomain?: string; lastLine?: number; lastIter?: number }
) {
  const params = new URLSearchParams({ action: "residuals", jobId: jobId || "" });
  if (opts?.appName) params.set("appName", opts.appName);
  if (opts?.appDomain) params.set("appDomain", opts.appDomain);
  if (opts?.lastLine) params.set("lastLine", String(opts.lastLine));
  if (opts?.lastIter) params.set("lastIter", String(opts.lastIter));

  return useQuery({
    queryKey: ["job-residuals", jobId, opts],
    queryFn: () => fetchJson(`/api/jobs?${params}`),
    enabled: !!jobId,
    refetchInterval: 5000,
  });
}

/** Job action mutation */
export function useJobAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, action }: { jobId: string; action: string }) => {
      return fetchJson(`/api/manager/jobs?action=${action}&jobId=${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hpc-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["db-jobs"] });
    },
  });
}

/** Delete DB job */
export function useDeleteDbJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      return fetchJson(`/api/jobs?action=delete&jobId=${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["db-jobs"] });
    },
  });
}

/** The user's saved runs (named job set-ups) */
export function useSavedRuns() {
  return useQuery({
    queryKey: ["saved-runs"],
    queryFn: () => fetchJson("/api/saved-runs"),
  });
}

export function useSaveRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: { name: string; appDomain: string; appName: string; type: string; jobArgs: Record<string, unknown> }) =>
      fetchJson("/api/saved-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-runs"] }),
  });
}

export function useDeleteSavedRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`/api/saved-runs?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-runs"] }),
  });
}
