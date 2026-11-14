import { describe, it, expect } from "vitest";
import { runRecipe, compileRecipe, makeRecipeParser, type Recipe } from "../recipe";
import openfoam from "../openfoam";
import type { ParserResult } from "../types";

const LOG = `
Time = 1
DILUPBiCG:  Solving for Ux, Initial residual = 1, Final residual = 0.002, No Iterations 3
DICPCG:  Solving for p, Initial residual = 0.1, Final residual = 0.0001, No Iterations 20
DICPCG:  Solving for p, Initial residual = 0.05, Final residual = 0.0001, No Iterations 10
Time = 2
DILUPBiCG:  Solving for Ux, Initial residual = 0.01, Final residual = 0.00002, No Iterations 3
DICPCG:  Solving for p, Initial residual = 0.001, Final residual = 0.0001, No Iterations 20
ExecutionTime = 12.5 s
End
`;

const recipe: Recipe = {
  logScale: false,
  iteration: { pattern: "^Time = ([0-9.]+)" },
  series: [
    {
      pattern: "Solving for ([a-zA-Z]+), Initial residual = ([0-9.eE+-]+)",
      label: "$1",
      value: 2,
      firstPerIteration: true,
    },
  ],
  outputs: [{ label: "Run time (s)", pattern: "ExecutionTime = ([0-9.]+)", type: "Number" }],
  end: { success: "^End$", error: "FOAM FATAL ERROR" },
};

describe("recipe parser", () => {
  it("matches the built-in OpenFOAM parser on the same log", async () => {
    const builtin = await new Promise<ParserResult>((resolve) => openfoam(LOG, 0, 0, {}, (_e, r) => resolve(r)));
    const viaRecipe = runRecipe({ ...recipe }, LOG);
    const b = builtin.graph as Record<string, { data: [number, number][] }>;
    for (const s of viaRecipe.graph as { label: string; data: [number, number][] }[]) {
      // built-in stores natural log; compare after converting back
      expect(s.data.map(([x, y]) => [x, y])).toEqual(b[s.label].data.map(([x, y]) => [x, Math.exp(y)]).map(([x, y]) => [x, Number(y.toPrecision(12))]));
    }
  });

  it("reads outputs and the end state", () => {
    const r = runRecipe(recipe, LOG);
    expect(r.custom?.outputs?.["Run time (s)"].value).toBe(12.5);
    expect(r.custom?.message?.type).toBe("success");
    expect(r.step.terminated).toBe(true);
    expect(r.matchedLines.length).toBe(8);
  });

  it("reports the error line", () => {
    const r = runRecipe(recipe, LOG + "--> FOAM FATAL ERROR: cannot open file\n");
    expect(r.custom?.message).toEqual({ type: "error", text: "--> FOAM FATAL ERROR: cannot open file" });
  });

  it("plots log10 when logScale is on and counts points without an iteration pattern", () => {
    const r = runRecipe({ logScale: true, series: [{ pattern: "Initial residual = ([0-9.]+)", label: "res" }] }, LOG);
    const g = r.graph as { data: [number, number][] }[];
    expect(g[0].data[0]).toEqual([1, 0]);
    expect(g[0].data[1]).toEqual([2, -1]);
  });

  it("resumes from a start line", () => {
    const r = runRecipe(recipe, LOG, 5);
    expect((r.graph as { label: string }[]).map((s) => s.label)).toEqual(["Ux", "p"]);
  });

  it("rejects invalid patterns and empty recipes", () => {
    expect(() => compileRecipe({ series: [] })).toThrow(/at least one series/);
    expect(() => compileRecipe({ series: [{ pattern: "(", label: "x" }] })).toThrow(/Series 1/);
  });

  it("works through the ParserFn contract", async () => {
    const r = await new Promise<ParserResult>((resolve) => makeRecipeParser(recipe)(LOG, 0, 0, {}, (_e, x) => resolve(x)));
    expect((r as any).matchedLines).toBeUndefined();
    expect(r.step.terminated).toBe(true);
  });
});
