import type { ParserFn, ParserResult, GraphSeries } from './types';

const firstLineRe = /\s+Iteration(\s+[a-zA-Z0-9_\/().\-]+)+\s+/;
const resLineRe = /\s+[0-9]+(\s+[\+|\-]*[0-9]\.[0-9]+(e|E)[\+|\-][0-9]+)+/;
const serverLineRe = /\s*Server::start\s+-host\s+([^\s:]+):([0-9]+)/;

/**
 * Siemens Star-CCM+ residuals parser.
 * Handles two phases:
 *   1. startLine=0: scan for header row and server connection info
 *   2. startLine>0: append residual rows from the data section
 * The column labels are positionally matched using the whitespace layout of
 * the first data row (Star-CCM+ uses fixed-width columns).
 */
const parser: ParserFn = function (outputFile, startLine, _startIter, _files, next) {
  const result: ParserResult = {
    graph: [],
    markings: [],
    step: { lastLine: 0 },
    custom: { outputs: {} },
  };

  const lines = outputFile.split('\n');
  let sl = Number(startLine);
  const items: GraphSeries[] = [];

  if (sl === 0) {
    let lblLine = '';
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i];

      // Server connection info
      const s = line.match(serverLineRe);
      if (s) {
        result.custom!.outputs!.host = { label: 'Host', value: s[1], type: 'Text' };
        result.custom!.outputs!.port = { label: 'Port', value: s[2], type: 'Text' };
        result.custom!.files = [
          {
            name: 'connectonLinux.sh',
            content: `#!/bin/bash\necho 'tryme'`,
          },
          {
            name: 'connectonWindows.bat',
            content: `@echo off\r\necho 'tryme'`,
          },
        ];
        continue;
      }

      const m = line.match(firstLineRe);
      if (m) {
        lblLine = m[0];
        sl = i;
        break;
      }
    }

    // Need at least one data line after the header to determine column widths
    const firstData = lines[i + 1];
    if (!lblLine || !firstData) {
      result.step = { lastLine: 0 };
      return next(null, result);
    }

    // Find whitespace boundaries in first data line for fixed-width column extraction
    const spaceRe = /\s+/g;
    const indexes: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = spaceRe.exec(firstData)) !== null) {
      indexes.push(match.index);
    }

    for (let idx = 0; idx < indexes.length; idx++) {
      const colLabel = lblLine
        .substring(indexes[idx], indexes[idx + 1])
        .trim()
        .replace(/_\s/g, '_');
      if (colLabel !== '') {
        items[idx] = { label: colLabel, data: [] };
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
          for (let r = 0; r < cols.length; r++) {
            if (!items[r]) items[r] = { label: `col${r}`, data: [] };
            items[r].data.push([Number(cols[0]), Math.log(Number(cols[r]))]);
          }
        }
      }
      result.step = { lastLine: j };
    }
  } else {
    result.step = { lastLine: 0 };
  }

  result.graph = items;
  return next(null, result);
};

export default parser;
export const require = 'outputFile';
