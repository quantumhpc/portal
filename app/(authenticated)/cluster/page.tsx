"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNodeList, useQueueList } from "@/hooks/use-cluster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NodeStateBadge, NodeStateLegend } from "@/components/cluster/node-state";
import {
  Cpu, MemoryStick, RefreshCw, Loader2, Server, ServerCog, ChevronDown, ChevronRight,
  ListOrdered, LayoutGrid, List, Boxes, type LucideIcon,
} from "lucide-react";

const JOB_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-pink-500",
  "bg-cyan-500", "bg-orange-500", "bg-red-400", "bg-teal-500", "bg-indigo-500",
];

/** hpcFormatter output: name, state, totalProcs, busyProcs, totMem/busyMem (GB), jobs */
function nodeNumbers(node: any) {
  return {
    totalProcs: node.totalProcs ?? node.procs ?? 0,
    busyProcs: node.busyProcs ?? 0,
    totalMem: node.totMem ?? node.totalMem ?? 0,
    busyMem: node.busyMem ?? 0,
    // node.jobs: [{ jobId, jobProcs }] from the scheduler
    jobs: (node.jobs ?? []).map((j: any) => String(j.jobId ?? j)) as string[],
  };
}

function ProgressBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{used}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2"><Icon className="h-5 w-5 text-muted-foreground" aria-hidden /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function NodeCard({ node, jobColorMap }: { node: any; jobColorMap: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const n = nodeNumbers(node);

  return (
    <Card className="overflow-hidden">
      <button className="w-full text-left" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <Server className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <CardTitle className="text-sm font-medium truncate">{node.name}</CardTitle>
            </div>
            <NodeStateBadge state={node.state} />
          </div>
        </CardHeader>
      </button>
      <CardContent className="px-4 pb-3 space-y-2">
        {n.totalProcs > 0 && <ProgressBar used={n.busyProcs} total={n.totalProcs} label="Cores" />}
        {n.totalMem > 0 && <ProgressBar used={n.busyMem} total={n.totalMem} label="Memory (GB)" />}
        {expanded && (
          <div className="pt-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {n.jobs.length ? "Running jobs" : "No running jobs"}
            </p>
            <div className="flex flex-wrap gap-1">
              {n.jobs.map((jobId: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${jobColorMap.get(jobId) ?? "bg-gray-400"}`} />
                  {jobId}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NodeTable({ nodes }: { nodes: any[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Node</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Jobs</TableHead>
            <TableHead className="text-right">Cores (busy/total)</TableHead>
            <TableHead className="text-right">Memory GB (busy/total)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((node: any, i: number) => {
            const n = nodeNumbers(node);
            return (
              <TableRow key={node.name ?? i}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2"><Server className="h-4 w-4 text-muted-foreground" aria-hidden />{node.name}</span>
                </TableCell>
                <TableCell><NodeStateBadge state={node.state} /></TableCell>
                <TableCell className="text-right">{n.jobs.length}</TableCell>
                <TableCell className="text-right">{n.totalProcs > 0 ? `${n.busyProcs}/${n.totalProcs}` : "-"}</TableCell>
                <TableCell className="text-right">{n.totalMem > 0 ? `${n.busyMem}/${n.totalMem}` : "-"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function QueueTable() {
  const { data: queues, isLoading } = useQueueList();
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!Array.isArray(queues) || queues.length === 0) {
    return <EmptyState icon={ListOrdered} title="No queues found" description="The scheduler reported no queues or partitions." />;
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Queue / partition</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Max time</TableHead>
            <TableHead className="text-right">Cores</TableHead>
            <TableHead className="text-right">Nodes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queues.map((q: any, i: number) => {
            const up = (q.State ?? q.state ?? "UP") === "UP" || q.state === "active";
            return (
              <TableRow key={q.name ?? q.PartitionName ?? i}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <ListOrdered className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {q.name ?? q.PartitionName}
                  </span>
                  {q.Default === "YES" && <Badge variant="secondary" className="ml-2 text-xs">default</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant={up ? "default" : "secondary"} className="text-xs">{q.State ?? q.state ?? "UP"}</Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{q.MaxTime ?? q.max_run ?? "-"}</TableCell>
                <TableCell className="text-right text-sm">{q.TotalCPUs ?? q.totalCpus ?? "-"}</TableCell>
                <TableCell className="text-right text-sm">{q.TotalNodes ?? q.totalNodes ?? "-"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ClusterView() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "queues" ? "queues" : "nodes";
  const { data, isLoading, refetch, isFetching } = useNodeList();
  const queues = useQueueList();
  const [view, setView] = useState<"cards" | "table">("cards");

  const nodes: any[] = data?.nodes ?? [];
  const status = data?.status;
  const runningJobIds: string[] = useMemo(() => data?.jobs ?? [], [data]);

  const jobColorMap = useMemo(() => {
    const map = new Map<string, string>();
    runningJobIds.forEach((jobId, i) => map.set(jobId, JOB_COLORS[i % JOB_COLORS.length]));
    return map;
  }, [runningJobIds]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ServerCog}
        title="Cluster"
        description="Nodes, queues and how busy they are right now."
        actions={
          <Button variant="outline" size="sm" onClick={() => { refetch(); queues.refetch(); }} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      {status && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile icon={Server} label="Nodes" value={nodes.length} />
          <StatTile icon={Cpu} label="Cores in use" value={`${status.globalBusyProcs ?? 0} / ${status.globalTotalProcs ?? 0}`} />
          <StatTile icon={MemoryStick} label="Memory in use (GB)" value={`${status.globalBusyMem ?? 0} / ${status.globalTotMem ?? 0}`} />
          <StatTile icon={Boxes} label="Running jobs" value={runningJobIds.length} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => router.replace(v === "queues" ? "/cluster?tab=queues" : "/cluster")} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="nodes"><Server className="mr-1 h-4 w-4" aria-hidden /> Nodes</TabsTrigger>
            <TabsTrigger value="queues"><ListOrdered className="mr-1 h-4 w-4" aria-hidden /> Queues</TabsTrigger>
          </TabsList>
          {tab === "nodes" && (
            <div className="flex items-center gap-3">
              <NodeStateLegend />
              <div className="flex rounded-md border" role="group" aria-label="Node view">
                <Button variant={view === "cards" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-label="Cards" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-label="Table" aria-pressed={view === "table"} onClick={() => setView("table")}>
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <TabsContent value="nodes">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : nodes.length === 0 ? (
            <EmptyState icon={Server} title="No nodes found" description="The scheduler reported no compute nodes." />
          ) : view === "table" ? (
            <NodeTable nodes={nodes} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodes.map((node: any, i: number) => (
                <NodeCard key={node.name ?? i} node={node} jobColorMap={jobColorMap} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="queues">
          <QueueTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ClusterPage() {
  // useSearchParams() needs a Suspense boundary for prerendering.
  return (
    <Suspense>
      <ClusterView />
    </Suspense>
  );
}
