import type { ParserFn, ParserResult, GraphSeries } from './types';

const firstLineRe = /\s+iter(\s+[a-z.-]+)+\s+time\/iter/;
const resLineRe =
  /\s+[0-9]+(\s+[0-9]\.[0-9]+e[\+|\-][0-9]+)+\s+[0-9]{1,2}:[0-9]{2}:[0-9]{2}\s+[0-9]+/;

/**
 * ANSYS Fluent residuals parser.
 * Extracts per-equation residuals from the Fluent transcript (.log).
 * On the first call (startLine=0) it scans for the header row that names
 * each equation, then on subsequent calls it appends new data rows.
 */
const parser: ParserFn = function (outputFile, startLine, _startIter, _files, next) {
  const result: ParserResult = { graph: [], markings: [], step: { lastLine: 0 } };

  const lines = outputFile.split('\n');
  let sl = Number(startLine);
  const items: GraphSeries[] = [];

  // First call: find the header line that names the equations
  if (sl === 0) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(firstLineRe);
      if (m) {
        const cols = m[0].trim().split(/[\s\/]+/g);
        // cols[0]='iter', cols[cols.length-1]='time', rest are equation names
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
          const itemNb = cols.length;
          for (let r = 1; r < itemNb - 2; r++) {
            if (!items[r - 1]) items[r - 1] = { label: `eq${r}`, data: [] };
            items[r - 1].data.push([Number(cols[0]), Math.log(Number(cols[r]))]);
          }
        }
      }
      result.step = { lastLine: j };
    }
  } else {
    result.step = { lastLine: 0 };
  }

  result.graph = items;
  next(null, result);
};

export default parser;
/** Fluent parser reads the main output log */
export const require = 'outputFile';
