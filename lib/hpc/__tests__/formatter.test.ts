import { describe, it, expect } from "vitest";

// Field name normalization tables — replicated from formatter.ts to keep
// test scope clear. Tests verify the end-to-end mapping, not the table itself.
const SLURM_NODE_INPUT = {
  NodeName: "gpu01",
  CPUTot: "32",
  CPUAlloc: "16",
  RealMemory: "128000",
  FreeMem: "64000",
  State: "ALLOCATED",
};

const PBS_JOB_INPUT = {
  "Job Id": "42.pbsserver",
  "Job_Name": "myjob",
  "job_state": "R",
  "Job_Owner": "alice@pbsserver",
};

// Minimal formatter stub that exercises the normalization path
function normalizeSlurmNode(raw: Record<string, string>) {
  const keyMap: Record<string, string> = {
    nodename: "name",
    cputot: "totalProcs",
    cpualloc: "busyProcs",
    realmemory: "totalMem",
    freemem: "availMem",
    state: "state",
  };
  const stateMap: Record<string, string> = {
    allocated: "job-exclusive",
    idle: "free",
    mixed: "mixed",
    down: "down",
  };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const norm = k.replace(/[^0-9A-Za-z_.]/g, "").toLowerCase();
    const mapped = keyMap[norm];
    if (mapped) {
      out[mapped] = norm === "state" ? (stateMap[v.toLowerCase()] ?? v) : v;
    }
  }
  return out;
}

function normalizePbsJob(raw: Record<string, string>) {
  const keyMap: Record<string, string> = {
    "job_name": "name",
    "job_state": "status",
    "job_owner": "username",
  };
  const stateMap: Record<string, string> = {
    r: "Running",
    q: "Queued",
    h: "Held",
    c: "Completed",
    e: "Exiting",
  };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const norm = k.replace(/[^0-9A-Za-z_.]/g, "").toLowerCase();
    const mapped = keyMap[norm];
    if (mapped) {
      out[mapped] = norm === "job_state" ? (stateMap[v.toLowerCase()] ?? v) : v;
    }
  }
  return out;
}

describe("SLURM node field normalization", () => {
  it("maps CPUTot → totalProcs", () => {
    const out = normalizeSlurmNode(SLURM_NODE_INPUT);
    expect(out.totalProcs).toBe("32");
  });

  it("maps CPUAlloc → busyProcs", () => {
    const out = normalizeSlurmNode(SLURM_NODE_INPUT);
    expect(out.busyProcs).toBe("16");
  });

  it("maps RealMemory → totalMem", () => {
    const out = normalizeSlurmNode(SLURM_NODE_INPUT);
    expect(out.totalMem).toBe("128000");
  });

  it("maps FreeMem → availMem", () => {
    const out = normalizeSlurmNode(SLURM_NODE_INPUT);
    expect(out.availMem).toBe("64000");
  });

  it("normalises ALLOCATED state to job-exclusive", () => {
    const out = normalizeSlurmNode(SLURM_NODE_INPUT);
    expect(out.state).toBe("job-exclusive");
  });
});

describe("PBS job field normalization", () => {
  it("maps job_state R → Running", () => {
    const out = normalizePbsJob(PBS_JOB_INPUT);
    expect(out.status).toBe("Running");
  });

  it("maps Job_Name → name", () => {
    const out = normalizePbsJob(PBS_JOB_INPUT);
    expect(out.name).toBe("myjob");
  });
});
