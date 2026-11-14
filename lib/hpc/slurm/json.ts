/**
 * Map Slurm's native JSON output (`--json`, Slurm ≥ 21.08) onto the key=value
 * shape the text parsers produce (`scontrol show …`, `squeue --format=%all`),
 * so the formatter and everything downstream work unchanged.
 *
 * The JSON schema changed between releases; these helpers accept every shape
 * seen from 21.08 to 24.x:
 *   numbers:  4  |  { set: true, infinite: false, number: 4 }
 *   states:   "IDLE"  |  ["IDLE", "DRAIN"]
 *   lists:    "a,b"  |  ["a", "b"]
 *   nodes:    "n[1-2]"  |  { configured: "n[1-2]", total: 2 }
 */

type Json = Record<string, any>;

/** Number from a plain or {set, infinite, number} value; 'UNLIMITED' for infinite. */
export function num(v: unknown): number | 'UNLIMITED' | undefined {
  if (v && typeof v === 'object' && 'number' in (v as Json)) {
    const o = v as Json;
    if (o.infinite) return 'UNLIMITED';
    if (o.set === false) return undefined;
    return Number(o.number);
  }
  if (v === undefined || v === null || v === '') return undefined;
  return Number(v);
}

const list = (v: unknown, sep = ',') => (Array.isArray(v) ? v.join(sep) : v === undefined || v === null ? '' : String(v));
const state = (v: unknown) => list(v, '+');
const firstState = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));
const text = (v: unknown, fallback = '') => (v === undefined || v === null || v === '' ? fallback : String(v));

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch seconds → Slurm's text timestamp (local time, no zone), or 'Unknown'. */
export function slurmTime(v: unknown): string {
  const t = num(v);
  if (typeof t !== 'number' || !t) return 'Unknown';
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Seconds → [D-]HH:MM:SS, as in RunTime / TIME. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return days ? `${days}-${hms}` : hms;
}

/** Minutes (time limits) → [D-]HH:MM:SS or UNLIMITED. */
export function minutes(v: unknown): string {
  const m = num(v);
  if (m === 'UNLIMITED') return 'UNLIMITED';
  if (m === undefined || Number.isNaN(m)) return 'UNLIMITED';
  return duration(m * 60);
}

function elapsed(job: Json, now: number): string {
  const start = num(job.start_time);
  if (typeof start !== 'number' || !start || start > now) return '0:00';
  const end = num(job.end_time);
  const stop = typeof end === 'number' && end > start && end < now ? end : now;
  return duration(stop - start);
}

/** `scontrol show nodes --json` → scontrol text blocks. */
export function nodesFromJson(data: Json): Record<string, string>[] {
  return (data.nodes ?? []).map((n: Json) => ({
    NodeName: text(n.name),
    State: state(n.state),
    CPUTot: text(n.cpus),
    CPUAlloc: text(n.alloc_cpus, '0'),
    RealMemory: text(num(n.real_memory)),
    AllocMem: text(num(n.alloc_memory), '0'),
    FreeMem: text(num(n.free_mem) ?? num(n.free_memory), 'N/A'),
    AvailableFeatures: list(n.features) || '(null)',
    ActiveFeatures: list(n.active_features) || '(null)',
    Gres: list(n.gres) || '(null)',
    Partitions: list(n.partitions),
    Arch: text(n.architecture),
    Version: text(n.version),
  }));
}

/** `scontrol show partition --json` → scontrol text blocks. */
export function partitionsFromJson(data: Json): Record<string, string>[] {
  return (data.partitions ?? []).map((p: Json) => {
    const nodes = p.nodes && typeof p.nodes === 'object' ? p.nodes : { configured: p.nodes, total: p.total_nodes };
    const flags: string[] = [...(p.flags ?? []), ...(p.partition?.flags ?? [])].map((f: unknown) => String(f).toUpperCase());
    return {
      PartitionName: text(p.name),
      State: firstState(p.partition?.state ?? p.state) || 'UP',
      Nodes: text(nodes.configured ?? nodes.allowed_allocation),
      TotalNodes: text(nodes.total ?? p.total_nodes, '0'),
      TotalCPUs: text(p.cpus?.total ?? p.total_cpus, '0'),
      Default: flags.includes('DEFAULT') ? 'YES' : 'NO',
      MaxTime: minutes(p.maximums?.time ?? p.max_time),
      DefaultTime: minutes(p.defaults?.time ?? p.default_time),
    };
  });
}

/** `scontrol show job [id] --json` → scontrol text blocks. */
export function jobsFromJson(data: Json, now = Date.now() / 1000): Record<string, string>[] {
  return (data.jobs ?? []).map((j: Json) => {
    const pending = firstState(j.job_state) === 'PENDING';
    return {
      JobId: text(j.job_id),
      JobName: text(j.name),
      UserId: text(j.user_name ?? j.user_id),
      GroupId: text(j.group_name ?? j.group_id),
      JobState: firstState(j.job_state),
      Reason: text(j.state_reason, 'None'),
      Priority: text(num(j.priority), '0'),
      Partition: text(j.partition),
      TimeLimit: minutes(j.time_limit),
      RunTime: elapsed(j, now),
      SubmitTime: slurmTime(j.submit_time),
      StartTime: slurmTime(j.start_time),
      EndTime: slurmTime(j.end_time),
      NodeList: pending ? '(null)' : text(j.nodes, '(null)'),
      NumCPUs: text(num(j.cpus)),
      NumNodes: text(num(j.node_count)),
      WorkDir: text(j.current_working_directory),
      StdOut: text(j.standard_output),
      StdErr: text(j.standard_error),
      Command: text(j.command),
    };
  });
}

/** `squeue --json` → squeue --format=%all rows (header names). */
export function queueFromJson(data: Json, now = Date.now() / 1000): Record<string, string>[] {
  return (data.jobs ?? []).map((j: Json) => {
    const st = firstState(j.job_state);
    return {
      JOBID: text(j.job_id),
      NAME: text(j.name),
      USER: text(j.user_name ?? j.user_id),
      STATE: st,
      PARTITION: text(j.partition),
      REASON: text(j.state_reason, 'None'),
      TIME: st === 'PENDING' ? '0:00' : elapsed(j, now),
      TIME_LIMIT: minutes(j.time_limit),
      PRIORITY: text(num(j.priority), '0'),
      WORK_DIR: text(j.current_working_directory),
      NODES: text(num(j.node_count), '1'),
      'NODELIST(REASON)': st === 'PENDING' ? `(${text(j.state_reason, 'None')})` : text(j.nodes),
      CPUS: text(num(j.cpus)),
      COMMAND: text(j.command),
    };
  });
}
