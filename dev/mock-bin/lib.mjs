// Shared helpers for SLURM/PBS mock binaries.
// Each mock binary is a small Node script that imports this module.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectDir = path.dirname(path.dirname(__dirname));

const SCENARIO_DIR = process.env.QHPC_MOCK_SCENARIO_DIR
  || path.join(projectDir, "dev", "mock-scenarios");
const STATE_ROOT   = process.env.QHPC_MOCK_STATE_ROOT || "/tmp/qhpc-mock";

export function loadScenario() {
  const name = process.env.QHPC_MOCK_SCENARIO || "default";
  // Allow either "default" or an absolute path.
  const filePath = path.isAbsolute(name)
    ? name
    : path.join(SCENARIO_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`mock: scenario not found: ${filePath}\n`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function stateDir(manager) {
  const dir = path.join(STATE_ROOT, manager);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function nextJobId(manager) {
  const dir = stateDir(manager);
  const counterFile = path.join(dir, ".counter");
  let last = 1000;
  try { last = parseInt(fs.readFileSync(counterFile, "utf-8"), 10) || 1000; } catch {}
  const id = last + 1;
  fs.writeFileSync(counterFile, String(id));
  return id;
}

export function writeJob(manager, job) {
  const dir = stateDir(manager);
  fs.writeFileSync(path.join(dir, `${job.id}.job`), JSON.stringify(job, null, 2));
}

export function readJob(manager, id) {
  const file = path.join(stateDir(manager), `${id}.job`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

export function listJobs(manager) {
  const dir = stateDir(manager);
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".job")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
    } catch {}
  }
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

export function deleteJob(manager, id) {
  const file = path.join(stateDir(manager), `${id}.job`);
  try { fs.unlinkSync(file); } catch {}
}

const TERMINAL_STATES = ["CANCELLED", "COMPLETED", "FAILED", "TIMEOUT"];
const TERMINAL_GRACE_MS = 60_000;

/**
 * True if the job reached a terminal state long enough ago that the real
 * scheduler would have dropped it from the queue. Callers (squeue/qstat)
 * should skip these and may delete the state file.
 */
export function isExpired(job) {
  if (!TERMINAL_STATES.includes(job.state)) return false;
  const endMs = Date.parse(job.endTime || job.startTime || "");
  if (Number.isNaN(endMs)) return false;
  return Date.now() - endMs > TERMINAL_GRACE_MS;
}

/**
 * On first call for a manager, materialize pre-seeded jobs from the scenario
 * into the state dir. Idempotent: skips if .seeded marker exists.
 */
// Scenarios use SLURM-style state names; map to PBS single-letter codes.
const PBS_STATE = { RUNNING: "R", PENDING: "Q", HELD: "H", COMPLETED: "F", FAILED: "F", CANCELLED: "F" };

export function ensureSeeded(manager, scenario) {
  const dir = stateDir(manager);
  const marker = path.join(dir, ".seeded");
  if (fs.existsSync(marker)) return;

  const startBase = Date.now();
  for (const j of scenario.preSeededJobs ?? []) {
    const id = nextJobId(manager);
    const startTime = new Date(startBase - (j.elapsedSec ?? 0) * 1000);
    const rawState = j.state || "RUNNING";
    const state = manager === "pbs" ? (PBS_STATE[rawState] || rawState) : rawState;
    writeJob(manager, {
      id,
      fullId: manager === "pbs" ? `${id}.${scenario.host || "mockhost"}` : undefined,
      name: j.name,
      user: j.user || os.userInfo().username,
      state,
      partition: j.queue || j.partition || "main",
      queue: j.queue || j.partition || "main",
      startTime: startTime.toISOString(),
      workdir: j.workdir || `/tmp/qhpc-mock-jobs/${j.name}`,
    });
  }
  fs.writeFileSync(marker, new Date().toISOString());
}

export function elapsedHms(startIso) {
  if (!startIso) return "0:00:00";
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) return "0:00:00";
  const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function host(scenario) {
  return scenario.host || "mockhost";
}

export function currentUser() {
  return process.env.USER || os.userInfo().username || "user";
}

/** Parse `--key=value` and `-k value` style argv into a flat object + positional. */
export function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.slice(2).split(/=(.*)/, 2);
      opts[k] = v;
    } else if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) { opts[k] = next; i++; }
      else opts[k] = true;
    } else if (a.startsWith("-") && a.length === 2) {
      const k = a.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) { opts[k] = next; i++; }
      else opts[k] = true;
    } else {
      positional.push(a);
    }
  }
  return { opts, positional };
}

// ---- Slurm --json emulation ----
// QHPC_MOCK_SLURM_VERSION picks the emulated release: >= 21.08 answers --json
// (23.x schema), older ones reject it like real Slurm, exercising the text path.
export const slurmVersion = process.env.QHPC_MOCK_SLURM_VERSION || "23.11.4";

export function slurmJsonSupported() {
  const [maj, min] = slurmVersion.split(".").map(Number);
  return maj > 21 || (maj === 21 && min >= 8);
}

/** Strip --json from argv; exit like an old sbatch/squeue when it is not supported. */
export function slurmJsonArg(binary) {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  if (json && !slurmJsonSupported()) {
    process.stderr.write(`${binary}: unrecognized option '--json'\n`);
    process.exit(1);
  }
  return { json, args: argv.filter(a => a !== "--json") };
}

/** Slurm 23.x number wrapper. */
export const sNum = (n) => ({ set: n !== undefined && n !== null, infinite: false, number: n ?? 0 });

export function hmsToMinutes(hms) {
  if (!hms) return 60;
  const [d, rest] = hms.includes("-") ? hms.split("-") : ["0", hms];
  const [h = 0, m = 0] = rest.split(":").map(Number);
  return Number(d) * 1440 + h * 60 + m;
}

export const epoch = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : 0);

export function slurmJobJson(j, reason) {
  const pending = j.state === "PENDING";
  return {
    job_id: Number(j.id),
    name: j.name,
    user_name: j.user,
    group_name: "users",
    job_state: [j.state],
    state_reason: reason,
    priority: sNum(j.held ? 0 : (j.priority ?? 100)),
    partition: j.partition,
    time_limit: sNum(hmsToMinutes(j.timelimit || "01:00:00")),
    submit_time: sNum(epoch(j.startTime)),
    start_time: sNum(pending ? 0 : epoch(j.startTime)),
    end_time: sNum(0),
    nodes: pending ? "" : "compute01",
    node_count: sNum(1),
    cpus: sNum(4),
    current_working_directory: j.workdir,
    standard_output: `${j.workdir}/${j.name}.out`,
    standard_error: `${j.workdir}/${j.name}.out`,
    command: `${j.workdir}/${j.name}`,
  };
}

export function slurmJsonEnvelope(key, items) {
  return JSON.stringify({
    meta: { plugin: { type: "openapi/slurmctld", name: "Slurm OpenAPI slurmctld", data_parser: "data_parser/v0.0.40" },
      slurm: { version: { major: slurmVersion.split(".")[0], minor: slurmVersion.split(".")[1], micro: slurmVersion.split(".")[2] || "0" }, release: slurmVersion } },
    [key]: items,
    warnings: [],
    errors: [],
  }, null, 2) + "\n";
}

export function slurmJsonError(description) {
  process.stdout.write(JSON.stringify({ errors: [{ description, error_number: 2017, error: "Invalid job id specified" }], warnings: [] }) + "\n");
  process.exit(1);
}

// ---- PBS -F json emulation ----
// QHPC_MOCK_PBS_VERSION: 14+ answers `-F json`; older releases reject -F (text path).
export const pbsVersion = process.env.QHPC_MOCK_PBS_VERSION || "2022.1.1";

/** Strip `-F json` from argv; exit like an old qstat/pbsnodes when unsupported. */
export function pbsJsonArg(binary) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("-F");
  if (i === -1) return { json: false, args: argv };
  if (Number(pbsVersion.split(".")[0]) < 14) {
    process.stderr.write(`${binary}: invalid option -- 'F'\n`);
    process.exit(2);
  }
  return { json: argv[i + 1] === "json", args: argv.filter((_, k) => k !== i && k !== i + 1) };
}

export function pbsJsonEnvelope(key, obj, scenario) {
  return JSON.stringify({
    timestamp: Math.floor(Date.now() / 1000),
    pbs_version: pbsVersion,
    pbs_server: scenario.host || "mockhost",
    [key]: obj,
  }, null, 4) + "\n";
}
