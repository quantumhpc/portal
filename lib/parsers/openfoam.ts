import type { ParserFn, ParserResult, GraphSeries } from './types';

// Transient solvers print fractional times (icoFoam: "Time = 0.005"), steady ones integers.
const timeLineRe = /^Time\s+=\s+([0-9.]+(?:[eE][+-]?[0-9]+)?)\s*$/;
const resLineRe =
  /^.+?Solving for ([a-zA-Z]+?), Initial residual = (.+?), Final residual = (.+?), No Iterations ([0-9]+)\s*/;

/**
 * OpenFOAM residuals parser.
 * Extracts initial residuals per equation per time step.
 * Special handling for pressure 'p': only the first occurrence per time step
 * is recorded to avoid duplicate entries from multiple correctors.
 */
const parser: ParserFn = function (outputFile, startLine, startIter, _files, next) {
  const result: ParserResult = { graph: {}, markings: [], step: { lastLine: 0 } };

  const lines = outputFile.split('\n');
  const sl = Number(startLine);
  const items: Record<string, GraphSeries> = {};
  let iteration = Number(startIter) || 1;
  let pres = false; // tracks first 'p' entry per time step

  let i = sl;
  for (; i < lines.length; i++) {
    const line = lines[i];

    const m = line.match(timeLineRe);
    if (m) {
      iteration = Number(m[1]);
      pres = true; // new time step — allow next p residual
      continue;
    }

    const n = line.match(resLineRe);
    if (n) {
      const eq = n[1];
      if (!items[eq]) {
        items[eq] = { label: eq, data: [] };
      }

      let save = true;
      if (eq === 'p') {
        if (pres) {
          pres = false; // consume the flag for this time step
        } else {
          save = false; // skip subsequent p residuals within same time step
        }
      }

      if (save) {
        items[eq].data.push([iteration, Math.log(Number(n[2]))]);
      }
    }
  }

  result.graph = items;
  result.step = {
    lastIter: iteration,
    lastLine: i,
    ended: iteration === Number(startIter),
  };

  next(null, result);
};

export default parser;
export const require = 'outputFile';
