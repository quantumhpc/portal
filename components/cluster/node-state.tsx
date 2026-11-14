import {
  CircleCheck, CircleDot, Cpu, CircleMinus, CircleX, CircleHelp, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StateStyle { icon: LucideIcon; cls: string; label: string }

const IDLE: StateStyle = { icon: CircleCheck, cls: "text-success", label: "Idle" };
const BUSY: StateStyle = { icon: Cpu, cls: "text-info", label: "Busy" };
const MIXED: StateStyle = { icon: CircleDot, cls: "text-amber-600 dark:text-warning", label: "Partly busy" };
const DRAIN: StateStyle = { icon: CircleMinus, cls: "text-orange-600 dark:text-orange-500", label: "Draining" };
const DOWN: StateStyle = { icon: CircleX, cls: "text-destructive", label: "Down" };
const UNKNOWN: StateStyle = { icon: CircleHelp, cls: "text-muted-foreground", label: "Unknown" };

/** Slurm and PBS node states → one of six display states. */
export function nodeState(raw: string | undefined): StateStyle {
  const s = (raw ?? "").toLowerCase();
  if (/down|offline|fail|not_responding|unknown-down/.test(s)) return DOWN;
  if (/drain/.test(s)) return DRAIN;
  if (/mix|job-shared/.test(s)) return MIXED;
  if (/alloc|busy|job-exclusive|completing/.test(s)) return BUSY;
  if (/idle|free/.test(s)) return IDLE;
  return UNKNOWN;
}

export function NodeStateBadge({ state }: { state?: string }) {
  const st = nodeState(state);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", st.cls)} title={state}>
      <st.icon className="h-3.5 w-3.5" aria-hidden />
      {st.label}
    </span>
  );
}

export function NodeStateLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {[IDLE, MIXED, BUSY, DRAIN, DOWN].map((st) => (
        <span key={st.label} className="inline-flex items-center gap-1">
          <st.icon className={cn("h-3.5 w-3.5", st.cls)} aria-hidden /> {st.label}
        </span>
      ))}
    </div>
  );
}
