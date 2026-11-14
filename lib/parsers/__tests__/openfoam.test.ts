import { describe, expect, it } from "vitest";
import parser from "../openfoam";
import type { ParserResult } from "../types";

// icoFoam output (cavity tutorial, OpenFOAM v2512): PISO prints p twice per step.
const icoFoam = `Starting time loop

Time = 0.005

Courant Number mean: 0 max: 0
smoothSolver:  Solving for Ux, Initial residual = 1, Final residual = 8.90511e-06, No Iterations 19
smoothSolver:  Solving for Uy, Initial residual = 0, Final residual = 0, No Iterations 0
DICPCG:  Solving for p, Initial residual = 1, Final residual = 0.0492854, No Iterations 12
time step continuity errors : sum local = 0.000466513, global = -1.79995e-19, cumulative = -1.79995e-19
DICPCG:  Solving for p, Initial residual = 0.590864, Final residual = 2.65225e-07, No Iterations 35
ExecutionTime = 0.01 s  ClockTime = 0 s

Time = 0.01

Courant Number mean: 0.0976825 max: 0.585607
smoothSolver:  Solving for Ux, Initial residual = 0.160686, Final residual = 6.83031e-06, No Iterations 19
smoothSolver:  Solving for Uy, Initial residual = 0.260828, Final residual = 9.65939e-06, No Iterations 18
DICPCG:  Solving for p, Initial residual = 0.428925, Final residual = 0.0103739, No Iterations 22
DICPCG:  Solving for p, Initial residual = 0.30209, Final residual = 5.26569e-07, No Iterations 33
ExecutionTime = 0.01 s  ClockTime = 0 s

End
`;

function run(text: string, startLine = 0, startIter = 0): ParserResult {
  let out: ParserResult | undefined;
  parser(text, startLine, startIter, [], (_err, r) => { out = r; });
  return out!;
}

describe("openfoam parser", () => {
  it("uses fractional times as x and takes p once per time step", () => {
    const g = run(icoFoam).graph as Record<string, { data: [number, number][] }>;
    expect(g.Ux.data.map(([x]) => x)).toEqual([0.005, 0.01]);
    expect(g.p.data).toHaveLength(2);
    expect(g.p.data[1][1]).toBeCloseTo(Math.log(0.428925));
    expect(g.Uy.data[1][1]).toBeCloseTo(Math.log(0.260828));
  });

  it("still reads integer times from steady solvers", () => {
    const g = run("Time = 1\nsmoothSolver:  Solving for Ux, Initial residual = 0.5, Final residual = 1e-3, No Iterations 2\nTime = 2\nsmoothSolver:  Solving for Ux, Initial residual = 0.25, Final residual = 1e-3, No Iterations 2\n").graph as Record<string, { data: [number, number][] }>;
    expect(g.Ux.data.map(([x]) => x)).toEqual([1, 2]);
  });

  it("ignores lines that only contain a time, such as ExecutionTime", () => {
    const g = run("ExecutionTime = 0.01 s  ClockTime = 0 s\nTime = 3e-05\nGAMG:  Solving for p, Initial residual = 0.1, Final residual = 1e-3, No Iterations 2\n").graph as Record<string, { data: [number, number][] }>;
    expect(g.p.data[0][0]).toBe(3e-5);
  });
});

describe("completeLines", () => {
  it("drops a half-written last line, so a poll never plots a truncated number", async () => {
    const { completeLines } = await import("../lines");
    const partial = "Time = 0.01\nsmoothSolver:  Solving for Ux, Initial residual = 0.1";
    const first = run(completeLines(partial));
    expect((first.graph as Record<string, unknown>).Ux).toBeUndefined();
    // The job page parses the whole file again on every poll.
    const whole = partial + "60686, Final residual = 6e-06, No Iterations 19\n";
    const next = run(completeLines(whole)).graph as Record<string, { data: [number, number][] }>;
    expect(next.Ux.data).toEqual([[0.01, Math.log(0.160686)]]);
  });

  it("keeps text that already ends with a newline", async () => {
    const { completeLines } = await import("../lines");
    expect(completeLines("a\nb\n")).toBe("a\nb\n");
    expect(completeLines("no newline yet")).toBe("");
  });
});
