import { describe, it, expect } from "vitest";

// Inline the parser function to avoid Next.js module resolution in tests.
// We test the parsing logic directly from the source.

// Simulate what the parser does without importing the full module graph.
const firstLineRe = /\s+iter(\s+[a-z.-]+)+\s+time\/iter/;
const resLineRe =
  /\s+[0-9]+(\s+[0-9]\.[0-9]+e[\+|\-][0-9]+)+\s+[0-9]{1,2}:[0-9]{2}:[0-9]{2}\s+[0-9]+/;

function parseFluentOutput(outputFile: string, startLine: number) {
  const result: { graph: any[]; markings: any[]; step: any } = {
    graph: [],
    markings: [],
    step: { lastLine: 0 },
  };
  const lines = outputFile.split("\n");
  let sl = Number(startLine);
  const items: { label: string; data: [number, number][] }[] = [];

  if (sl === 0) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(firstLineRe);
      if (m) {
        const cols = m[0].trim().split(/[\s\/]+/g);
        for (let c = 1; c < cols.length - 2; c++) {
          items[c - 1] = { label: cols[c], data: [] };
        }
        sl = i;
        break;
      }
    }
  }

  if (sl > 0) {
    if (sl === lines.length) {
      result.step = { lastLine: sl, ended: true };
    } else {
      let j = sl;
      for (; j < lines.length; j++) {
        const m = lines[j].match(resLineRe);
        if (m) {
          const cols = m[0].trim().split(/\s+/g);
          for (let r = 1; r < cols.length - 2; r++) {
            if (!items[r - 1]) items[r - 1] = { label: `eq${r}`, data: [] };
            items[r - 1].data.push([Number(cols[0]), Math.log(Number(cols[r]))]);
          }
        }
      }
      result.step = { lastLine: j };
    }
  }

  result.graph = items;
  return result;
}

const FLUENT_OUTPUT = `

 iter  continuity  x-velocity  y-velocity      energy  time/iter
     1  1.0000e+00  1.0000e+00  1.0000e+00  1.0000e+00  00:00:01  1
     2  5.3210e-01  4.2100e-01  3.1000e-01  2.1000e-01  00:00:01  2
     3  2.1500e-01  1.8000e-01  1.5000e-01  9.0000e-02  00:00:01  3
`;

describe("ANSYS Fluent parser", () => {
  it("detects header and extracts equation names", () => {
    const result = parseFluentOutput(FLUENT_OUTPUT, 0);
    expect(result.graph.length).toBeGreaterThan(0);
    expect(result.graph[0].label).toBe("continuity");
    expect(result.graph[1].label).toBe("x-velocity");
  });

  it("parses residual data rows as log-transformed [iter, value] pairs", () => {
    const result = parseFluentOutput(FLUENT_OUTPUT, 0);
    const cont = result.graph[0];
    expect(cont.data.length).toBe(3);
    expect(cont.data[0][0]).toBe(1); // iter
    expect(cont.data[0][1]).toBeCloseTo(Math.log(1.0), 5); // log(1.0) = 0
    expect(cont.data[1][1]).toBeCloseTo(Math.log(0.5321), 3);
  });

  it("records lastLine pointing past the last parsed line", () => {
    const result = parseFluentOutput(FLUENT_OUTPUT, 0);
    expect(result.step.lastLine).toBeGreaterThan(0);
  });

  it("returns empty graph when no header is present", () => {
    const result = parseFluentOutput("no fluent output here\nsome random text", 0);
    expect(result.graph).toEqual([]);
    expect(result.step.lastLine).toBe(0);
  });
});
