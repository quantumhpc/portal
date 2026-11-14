import type { ParserFn, ParserResult, GraphSeries } from './types';

const resLineRe = /\s+[0-9]+(\s+[0-9]\.[0-9]+e[\+|\-][0-9]+)+/;
const BASE_LABELS = ['Objective', 'Max_Const_Violation'];

/**
 * Altair OptiStruct optimisation history parser.
 * Reads from the .hist file.
 * Each data row: iteration  Objective  MaxConstraintViolation  DV1  DV2  ...
 * All y values are plotted as log(value).
 */
const parser: ParserFn = function (outputFile, startLine, _startIter, _files, next) {
  const result: ParserResult = { graph: [], markings: [], step: { lastLine: 0 } };

  const lines = outputFile.split('\n');
  const sl = Number(startLine);
  const items: GraphSeries[] = [];

  let j = sl;
  for (; j < lines.length; j++) {
    const m = lines[j].match(resLineRe);
    if (m) {
      const cols = m[0].trim().split(/\s+/g);
      for (let r = 1; r < cols.length; r++) {
        if (!items[r - 1]) {
          const label =
            r - 1 < BASE_LABELS.length
              ? BASE_LABELS[r - 1]
              : `Design_variables${r - 2}`;
          items[r - 1] = { label, data: [] };
        }
        items[r - 1].data.push([Number(cols[0]), Math.log(Number(cols[r]))]);
      }
    }
  }

  result.step = { lastLine: j };
  result.graph = items;
  next(null, result);
};

export default parser;
/** OptiStruct parser reads the optimisation history file */
export const require = 'historyFile';
