"use client";

import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { MoreHorizontal, CircleX, Pause, Play, RotateCcw, Info } from "lucide-react";
import { useJobAction } from "@/hooks/use-jobs";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import Link from "next/link";
import { canCancel } from "./can-cancel";

/** Cancel a job after a confirmation that names it. Props other than the job pass through to ConfirmButton. */
export function CancelJobButton({ jobId, name, trigger, open, onOpenChange }: {
  jobId: string;
  name?: string;
  trigger?: ReactNode | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const jobAction = useJobAction();
  const what = name && name !== jobId ? `"${name}" (${jobId})` : jobId;
  return (
    <ConfirmButton
      label="Cancel job"
      icon={CircleX}
      dismissLabel="Keep job"
      confirmText={`Cancel job ${what}? The scheduler stops it. This cannot be undone.`}
      pending={jobAction.isPending}
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() =>
        jobAction.mutate(
          { jobId, action: "cancel" },
          {
            onSuccess: () => toast.success(`Job ${jobId} cancelled`),
            onError: (err) => toast.error(err.message),
          },
        )
      }
    />
  );
}

interface JobActionsProps {
  jobId: string;
  name?: string;
  status?: string;
  username?: string;
}

export function JobActions({ jobId, name, status, username }: JobActionsProps) {
  const jobAction = useJobAction();
  const { data: session } = useSession();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const handleAction = (action: string, label: string) => {
    jobAction.mutate(
      { jobId, action },
      {
        onSuccess: () => toast.success(`${label} successful for job ${jobId}`),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const isRunning = status === "Running";
  const isQueued = status === "Queued";
  const isHeld = status === "Held";
  const cancellable = canCancel({ username, status }, session?.user as any);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for job ${jobId}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/job/${jobId}`}>
              <Info className="mr-2 h-4 w-4" />
              Details
            </Link>
          </DropdownMenuItem>
          {(isQueued || isHeld || isRunning || cancellable) && <DropdownMenuSeparator />}
          {isQueued && (
            <DropdownMenuItem onClick={() => handleAction("hold", "Hold")}>
              <Pause className="mr-2 h-4 w-4" />
              Hold
            </DropdownMenuItem>
          )}
          {isHeld && (
            <DropdownMenuItem onClick={() => handleAction("release", "Release")}>
              <Play className="mr-2 h-4 w-4" />
              Release
            </DropdownMenuItem>
          )}
          {/* Requeue (srequeue / qrerun) applies only to a running job. */}
          {isRunning && (
            <DropdownMenuItem onClick={() => handleAction("rerun", "Rerun")}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Rerun
            </DropdownMenuItem>
          )}
          {cancellable && (
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmCancel(true)}>
              <CircleX className="mr-2 h-4 w-4" />
              Cancel
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu: the menu unmounts its content when it closes. */}
      {cancellable && (
        <CancelJobButton jobId={jobId} name={name} trigger={null} open={confirmCancel} onOpenChange={setConfirmCancel} />
      )}
    </>
  );
}
