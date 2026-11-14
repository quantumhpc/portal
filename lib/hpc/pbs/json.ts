/**
 * Map PBS JSON output (`-F json`: qstat, pbsnodes) onto the shapes the text
 * parsers produce, so the formatter and everything downstream work unchanged.
 *
 * PBS JSON uses the same attribute names as `qstat -f` / `pbsnodes -a`, but
 * nests resources (`Resource_List: { walltime }`) where text says
 * `Resource_List.walltime`. Values come back as numbers or strings; text
 * parsing always gave strings.
 */

type Json = Record<string, any>;

/** Flatten nested objects to dotted keys with string values; `keep` keys stay objects. */
export function flatten(obj: Json, keep: string[] = [], prefix = ''): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !keep.includes(key)) {
      Object.assign(out, flatten(v, keep, key));
    } else if (keep.includes(key)) {
      out[key] = Object.fromEntries(Object.entries(v ?? {}).map(([a, b]) => [a, String(b)]));
    } else {
      out[key] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  return out;
}

/** `pbsnodes -a -F json` → raw node records (before the jobs list is parsed). */
export function nodesFromJson(data: Json): Json[] {
  return Object.entries(data.nodes ?? {}).map(([name, attrs]) => ({ name, ...flatten(attrs as Json) }));
}

/** `qstat -x -f -F json` → full job records, keyed like `qstat -f` text. */
export function fullJobsFromJson(data: Json): Json[] {
  return Object.entries(data.Jobs ?? {}).map(([jobId, attrs]) => ({ jobId, ...flatten(attrs as Json, ['Variable_List']) }));
}

const stripHost = (p?: string) => (p && p.includes(':') ? p.split(':').slice(1).join(':') : p);

/** Full records → `qstat -x -w` rows ({ jobId, name, user, time, status, queue }). */
export function jobListFromJson(data: Json, status: Record<string, string>): Json[] {
  return fullJobsFromJson(data).map((j) => ({
    jobId: j.jobId,
    name: j.Job_Name,
    user: (j.Job_Owner ?? '').split('@')[0], // qstat -w shows the bare user
    time: j['resources_used.walltime'] ?? '0',
    status: status[j.job_state] || j.job_state,
    queue: j.queue,
  }));
}

/** Full records → `qstat -x -w -s -1` rows (useAlternate). */
export function jobListAltFromJson(data: Json): Json[] {
  return fullJobsFromJson(data).map((j) => ({
    jobId: j.jobId,
    user: (j.Job_Owner ?? '').split('@')[0],
    queue: j.queue,
    name: j.Job_Name,
    sessionID: j.session_id ?? '--',
    NDS: j['Resource_List.nodect'] ?? '1',
    TSK: j['Resource_List.ncpus'] ?? '1',
    req_memory: j['Resource_List.mem'] ?? '--',
    req_time: j['Resource_List.walltime'] ?? '--',
    status: j.job_state,
    time: j['resources_used.walltime'] ?? '--',
    comment: j.comment ?? '--',
    outputPath: stripHost(j.Output_Path),
  }));
}

function stateCounts(s: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of String(s ?? '').matchAll(/(\w+):(\d+)/g)) out[m[1].toLowerCase()] = m[2];
  return out;
}

const yes = (v: unknown) => v === true || /^(true|yes|1)$/i.test(String(v));

/** `qstat -Q -f -F json` → `qstat -Q` rows. */
export function queuesFromJson(data: Json): Json[] {
  return Object.entries(data.Queue ?? {}).map(([name, q]: [string, any]) => {
    const c = stateCounts(q.state_count);
    return {
      name,
      maxJobs: String(q.max_run ?? q.max_queued ?? '0'),
      totalJobs: String(q.total_jobs ?? '0'),
      enabled: yes(q.enabled),
      started: yes(q.started),
      queued: c.queued ?? '0',
      running: c.running ?? '0',
      held: c.held ?? '0',
      waiting: c.waiting ?? '0',
      moving: c.transit ?? '0',
      exiting: c.exiting ?? '0',
      type: /^r/i.test(String(q.queue_type ?? '')) ? 'Routing' : 'Execution',
      completed: c.finished ?? c.completed ?? '0',
    };
  });
}
