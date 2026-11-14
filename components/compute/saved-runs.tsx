"use client";

import Link from "next/link";
import { Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppIcon } from "./app-icon";
import { useAppInfo } from "@/hooks/use-cluster";
import { useDeleteSavedRun, useSavedRuns } from "@/hooks/use-jobs";

/** "Your saved set-ups" row on the Start a job page; hidden when there are none. */
export function SavedRuns() {
  const { data: runs } = useSavedRuns();
  const { data: info } = useAppInfo();
  const del = useDeleteSavedRun();

  if (!Array.isArray(runs) || runs.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="saved-runs-title">
      <h3 id="saved-runs-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Your saved set-ups
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {runs.map((run: any) => {
          const app = info?.appList?.[run.appDomain]?.[run.appName];
          return (
            <Card key={run._id} className="hover:border-primary transition-colors h-full">
              <CardContent className="pt-6 flex items-start gap-3">
                <Link
                  href={`/compute/${encodeURIComponent(run.appDomain)}/${encodeURIComponent(run.appName)}/${run.type}?saved=${run._id}`}
                  className="flex flex-1 min-w-0 items-start gap-3"
                >
                  <div className="rounded-lg bg-muted p-2">
                    {app ? <AppIcon logo={app.logo} size={32} /> : <Bookmark className="h-8 w-8 text-muted-foreground" aria-hidden />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-sm truncate">{run.name}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {app?.name || run.appName}
                      {run.jobArgs?.numProcs ? ` · ${run.jobArgs.numProcs} cores` : ""}
                    </p>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Delete saved set-up ${run.name}`}
                  onClick={() =>
                    del.mutate(run._id, {
                      onSuccess: () => toast.success(`Deleted "${run.name}"`),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
