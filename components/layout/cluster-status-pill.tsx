"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

interface NodeListResult {
  status?: {
    globalBusyProcsPerc?: number;
    globalDownProcsPerc?: number;
    globalTotalProcs?: number;
  };
}

type ClusterTone = "idle" | "busy" | "down" | "unknown";

function classify(s?: NodeListResult["status"]): { tone: ClusterTone; label: string } {
  if (!s) return { tone: "unknown", label: "Unknown" };
  const busy = s.globalBusyProcsPerc ?? 0;
  const down = s.globalDownProcsPerc ?? 0;
  if ((s.globalTotalProcs ?? 0) === 0) return { tone: "down", label: "Cluster down" };
  if (down >= 10) return { tone: "down", label: "Cluster degraded" };
  if (busy > 80) return { tone: "busy", label: "Cluster busy" };
  return { tone: "idle", label: "Cluster available" };
}

export function ClusterStatusPill() {
  const { data } = useQuery<NodeListResult>({
    queryKey: ["cluster-status"],
    queryFn: async () => {
      const res = await fetch("/api/manager/nodes?action=list");
      if (!res.ok) throw new Error("nodes");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const { tone, label } = classify(data?.status);
  const dotColor: Record<ClusterTone, string> = {
    idle:    "bg-success",
    busy:    "bg-warning",
    down:    "bg-destructive",
    unknown: "bg-muted-foreground/40",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      title={label}
      className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-1.5 py-1.5 text-xs font-medium sm:px-2.5 sm:py-1"
    >
      <span aria-hidden="true" className={cn("inline-block h-2 w-2 rounded-full", dotColor[tone])} />
      <Activity aria-hidden="true" className="hidden h-3 w-3 text-muted-foreground sm:block" />
      {/* Below sm only the dot shows; the label stays for screen readers. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </div>
  );
}
