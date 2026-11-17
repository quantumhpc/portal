import type { ParserFn, ParserResult, GraphSeries } from './types';

const timeStepRe = /^\s*(TIME STEP|OUTER LOOP ITERATION)\s+=\s+([0-9]+)/;
const coeffLoopRe = /^\s*COEFFICIENT LOOP ITERATION\s+=\s+([0-9]+)/;
const resLineRe =
  /^\s*\|\s*(.+?)\s+\|\s*([0-9\.]+?)\s*\|\s*([0-9\.]+?E[\+\-0-9]+?)\s*\|\s*([0-9\.]+?E[\+\-0-9]+?)\s*\|\s*(.+?)\s*\|/;

const MAX_LINES = 5000;

/**
 * ANSYS CFX residuals parser.
 * Tracks coefficient loop iterations and extracts RMS residuals per equation
 * from the tabular residual output block.
 */
const parser: ParserFn = function (outputFile, startLine, startIter, _files, next) {
  const result: ParserResult = { graph: {}, markings: [], step: { lastLine: 0 } };

  const lines = outputFile.split('\n');
  const sl = Math.max(Number(startLine), lines.length - MAX_LINES);
  const items: Record<string, GraphSeries> = {};
  let iteration = Number(startIter) || 0;
  let coeffLoop = 1;

  for (let i = sl; i < Math.min(lines.length, sl + MAX_LINES); i++) {
    const line = lines[i];

    const m = line.match(timeStepRe);
    if (m) {
      iteration = Number(m[2]);
      continue;
    }

    const n = line.match(coeffLoopRe);
    if (n) {
      coeffLoop = Number(n[1]);
      continue;
    }

    const o = line.match(resLineRe);
    if (o && coeffLoop >= 1 && iteration >= 1) {
      const eqName = o[1];
      if (!items[eqName]) {
        items[eqName] = { label: eqName, data: [] };
      }
      items[eqName].data.push([iteration, Math.log(Number(o[3]))]);
    }
  }

  result.graph = items;
  result.step = {
    lastIter: iteration,
    lastLine: Math.min(lines.length, sl + MAX_LINES),
    ended: iteration === Number(startIter),
  };

  next(null, result);
};

export default parser;
export const require = 'outputFile';
