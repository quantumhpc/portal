#!/usr/bin/env node
// Called when a job started by runIfEnabled (QHPC_MOCK_RUN=1) exits:
// finish.mjs <manager> <id> <exit code>. A cancelled job keeps its state.
import { readJob, writeJob } from "./lib.mjs";

const [manager, id, code] = process.argv.slice(2);
const j = readJob(manager, id);
if (j && (j.state === "RUNNING" || j.state === "R")) {
  const ok = code === "0";
  j.state = manager === "pbs" ? "F" : ok ? "COMPLETED" : "FAILED";
  j.exitCode = Number(code);
  j.endTime = new Date().toISOString();
  writeJob(manager, j);
}
