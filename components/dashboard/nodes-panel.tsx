"use client";

import { useNodeList } from "@/hooks/use-cluster";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server } from "lucide-react";
import Link from "next/link";

export function NodesPanel() {
  const { data, isLoading, error } = useNodeList();

  const nodes = data?.nodes || data || [];
  const stats = data?.status || null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          <Server className="inline-block w-4 h-4 mr-2" />
          Cluster status
        </CardTitle>
        <Link href="/cluster" className="text-xs text-muted-foreground hover:underline">
          Details
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load cluster info</p>
        )}
        {stats && (() => {
          const total = stats.globalTotalProcs || 0;
          const busy = Math.min(100, Math.max(0, stats.globalBusyProcsPerc ?? (total ? (100 * (stats.globalBusyProcs || 0)) / total : 0)));
          const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
          return (
            <div className="space-y-2">
              <p className="text-2xl font-bold">
                {stats.globalFreeProcs || 0} <span className="text-sm font-normal text-muted-foreground">of {total} cores free</span>
              </p>
              <div
                className="h-2 bg-muted rounded-full overflow-hidden"
                role="meter"
                aria-label="Cores in use"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(busy)}
              >
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${busy}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {Math.round(busy)}% in use · {nodeCount} {nodeCount === 1 ? "node" : "nodes"}
                {stats.globalDownProcs ? ` · ${stats.globalDownProcs} cores down` : ""}
              </p>
            </div>
          );
        })()}
        {!stats && !isLoading && !error && (
          <p className="text-sm text-muted-foreground">
            {Array.isArray(nodes) ? nodes.length : 0} nodes. No core counts reported.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
