"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Circle, Play, Pause, CheckCircle, XCircle, Clock, HelpCircle } from "lucide-react";

// Colours from the theme tokens: green = running, amber = waiting on someone, red = failed.
const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Circle; className?: string; label?: string }> = {
  Running: { variant: "default", icon: Play, className: "bg-success text-success-foreground" },
  Queued: { variant: "secondary", icon: Clock },
  Completed: { variant: "outline", icon: CheckCircle },
  Error: { variant: "destructive", icon: XCircle },
  Failed: { variant: "destructive", icon: XCircle },
  Held: { variant: "default", icon: Pause, className: "bg-warning text-warning-foreground" },
  Suspended: { variant: "default", icon: Pause, className: "bg-warning text-warning-foreground" },
  New: { variant: "secondary", icon: Circle },
  Configuring: { variant: "secondary", icon: Clock },
  Exiting: { variant: "outline", icon: Circle },
  // The portal's record of a job that has left the queue; success or failure is in its output.
  Archive: { variant: "outline", icon: CheckCircle, label: "Finished" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config: (typeof statusConfig)[string] = statusConfig[status] || { variant: "outline", icon: HelpCircle };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label ?? status}
    </Badge>
  );
}
