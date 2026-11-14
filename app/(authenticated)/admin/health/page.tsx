"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/fetch-json";
import type { CheckStatus, HealthCheck, HealthReport } from "@/lib/health";

const ICON: Record<CheckStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: "text-success", label: "OK" },
  warn: { icon: AlertTriangle, className: "text-amber-600 dark:text-warning", label: "Warning" },
  fail: { icon: XCircle, className: "text-destructive", label: "Problem" },
};

function CheckRow({ check }: { check: HealthCheck }) {
  const { icon: Icon, className, label } = ICON[check.status];
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${className}`} aria-label={label} role="img" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{check.title}</p>
        <p className="text-sm text-muted-foreground break-words">{check.detail}</p>
        {check.fix && check.status !== "ok" && (
          <p className="text-sm"><span className="font-medium">Fix: </span>{check.fix}</p>
        )}
      </div>
    </li>
  );
}

export default function HealthPage() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<HealthReport>({
    queryKey: ["admin-health"],
    queryFn: () => fetchJson("/api/admin/health"),
  });

  const groups = new Map<string, HealthCheck[]>();
  for (const c of data?.checks ?? []) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {data
            ? `${data.summary.fail} problem(s), ${data.summary.warn} warning(s), ${data.summary.ok} OK · checked ${new Date(data.generatedAt).toLocaleTimeString()}`
            : "Checks sign-in, the scheduler, storage and the database, and says how to fix what fails."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden /> Check again
          </Button>
          <Button asChild size="sm" title="Checks, versions and configuration with passwords and secrets removed">
            <a href="/api/admin/health?bundle=1" download>
              <Download className="mr-2 h-4 w-4" aria-hidden /> Support bundle
            </a>
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      )}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {[...groups].map(([group, checks]) => (
        <Card key={group}>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">{group}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {checks.map((c) => <CheckRow key={c.title} check={c} />)}
            </ul>
          </CardContent>
        </Card>
      ))}

      {data && (
        <p className="text-xs text-muted-foreground">
          The support bundle holds these results, the portal, Node.js and OS versions, and the configuration with every password,
          secret, token and connection string replaced by [redacted]. Read it before you send it.
        </p>
      )}
    </div>
  );
}
