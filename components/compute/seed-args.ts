import type { JobArgs, TemplateField } from "@/lib/hpc/job-template";

const FIXED = new Set(["appDomain", "appName", "type"]);

/** Overlay `initial` on the form defaults. File fields start empty: the files must be attached again. */
export function seedArgs(base: JobArgs, initial: JobArgs | undefined, fields: Record<string, TemplateField>, versions: string[]): JobArgs {
  if (!initial) return base;
  const fileFlags = new Set(Object.entries(fields).filter(([, f]) => f.type === "file").map(([id]) => `use${id}`));
  const out: JobArgs = { ...base };
  for (const k of Object.keys(base)) {
    if (k in initial && !FIXED.has(k) && !fileFlags.has(k)) out[k] = initial[k];
  }
  out.numProcs = Math.max(1, Number(out.numProcs) || 1);
  if (!versions.includes(String(out.version))) out.version = base.version;
  return out;
}

/** Default job name: the app name plus the local date and time, e.g. `fluent-1111-1407`, so runs tell apart. */
export function defaultJobName(appName: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${appName}-${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}
