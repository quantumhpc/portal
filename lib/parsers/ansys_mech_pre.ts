import type { PreProcessorFn } from './types';

const timeLineRe = /^time,([0-9]+\.?[0-9]*)/;
const titleLineRe = /^\/title,(.+)/;

export interface AnsynMechPreResult {
  steps: { name: string; endTime: number }[];
  customName?: string;
}

/**
 * ANSYS Mechanical pre-processor.
 * Parses the APDL input file (.inp / .dat) to extract load-step end times
 * and an optional model title, which are later used by the post-processor
 * to compute per-step progress percentages.
 */
const preParser: PreProcessorFn = function (files, preProc, next) {
  const state: AnsynMechPreResult = preProc || { steps: [] };
  if (!state.steps) state.steps = [];

  const inputFile = files.inputFile;
  if (inputFile) {
    for (const line of inputFile.split('\n')) {
      const t = line.match(timeLineRe);
      if (t) {
        state.steps.push({
          name: `Load-Step ${state.steps.length + 1}`,
          endTime: Number(t[1]),
        });
        continue;
      }
      const u = line.match(titleLineRe);
      if (u) {
        state.customName = u[1];
      }
    }
  }

  return next(null, state);
};

export default preParser;
