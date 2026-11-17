import type { ParserFn, ParserResult, GraphSeries, Marking } from './types';
import type { AnsynMechPreResult } from './ansys_mech_pre';

const lsLineRe = /^\s*LOAD STEP NUMBER[\s\.]+([0-9]+)/;
const convLineRe =
  /^\s*(.+) CONVERGENCE VALUE\s*\=\s*([0-9]+\.?[0-9]*(?:[Ee][+-]?[0-9]+)?)\s*CRITERION\s*\=\s*([0-9]+\.?[0-9]*(?:[Ee][+-]?[0-9]+)?)/;
const eqLineRe = /^\s*EQUIL ITER\s+([0-9]+)\s+COMPLETED/;
const subLineRe =
  /^[\s\*]+LOAD STEP\s*([0-9]+)\s*SUBSTEP\s*([0-9]+)\s*COMPLETED\.\s*CUM ITER\s*=\s*([0-9]+)/;
const timeLineRe = /^\s*\*\*\*\s*TIME\s+=\s+([0-9]+\.?[0-9]*)\s+TIME INC\s+=\s+([0-9]+\.?[0-9]*)/;

const ITEMS = ['force', 'moment', 'disp', 'htflow', 'current'];
const ITEM_LABELS = ['Force', 'Moment', 'Disp', 'HT Flow', 'Current'];

/**
 * ANSYS Mechanical convergence post-processor.
 * Extracts per-equation convergence values and criterion values for plotting,
 * plus load-step / sub-step markers for the graph.
 * When preData (from ansys_mech_pre) is provided, computes per-step progress.
 */
const parser: ParserFn = function (outputFile, startLine, startIter, preData, next) {
  const result: ParserResult = { graph: [], markings: [], step: { lastLine: 0 } };

  const lines = outputFile.split('\n');
  const sl = Number(startLine);

  // Initialise data series for each physics item
  const data: Record<string, GraphSeries> = {};
  for (let it = 0; it < ITEMS.length; it++) {
    data[`${ITEMS[it]}Conv`] = { label: `${ITEM_LABELS[it]} Convergence`, data: [] };
    data[`${ITEMS[it]}Crit`] = { label: `${ITEM_LABELS[it]} Criterion`, data: [] };
  }

  const markings: Record<string, Marking> = {
    loadStep: { label: 'Load-Step', data: [], type: 'xaxis' },
    subStep:  { label: 'Sub-Step Converged', data: [], type: 'xaxis' },
  };

  let lastTime = 0;
  let iteration = Number(startIter) || 0;
  let i = sl;

  for (; i < lines.length; i++) {
    const line = lines[i];

    const ls = line.match(lsLineRe);
    if (ls) {
      markings.loadStep.data.push([iteration, iteration, `LS ${ls[1]}`]);
      markings.subStep.data.pop();
      continue;
    }

    const conv = line.match(convLineRe);
    if (conv) {
      const lbl = conv[1].toLowerCase().replace(/\s/, '');
      if (data[`${lbl}Conv`]) {
        data[`${lbl}Conv`].data.push([iteration, Math.log(Number(conv[2]))]);
        data[`${lbl}Crit`].data.push([iteration, Math.log(Number(conv[3]))]);
      }
      continue;
    }

    const eq = line.match(eqLineRe);
    if (eq) {
      iteration++;
      continue;
    }

    const t = line.match(timeLineRe);
    if (t) {
      lastTime = Number(t[1]);
      continue;
    }

    const ss = line.match(subLineRe);
    if (ss) {
      markings.subStep.data.push([iteration, iteration, `SS ${ss[2]}`]);
    }
  }

  // Compute per-step progress using pre-processor data
  const mechPre = preData as AnsynMechPreResult | undefined;
  if (mechPre?.steps && Object.keys(mechPre.steps).length > 0) {
    result.custom = {};
    let currStep = false;
    for (const step of mechPre.steps) {
      if (!currStep) {
        if (lastTime < step.endTime) {
          (step as any).progress =
            ((step.endTime - lastTime) / step.endTime) * 100;
          currStep = true;
        } else {
          (step as any).progress = 100;
        }
      } else {
        (step as any).progress = 0;
      }
    }

    const lastStep = mechPre.steps[mechPre.steps.length - 1];
    result.custom.message =
      lastTime === lastStep.endTime
        ? { text: 'Computation terminated', type: 'success' }
        : { text: `Current simulation time: ${lastTime} s.`, type: 'info' };

    result.custom.array = mechPre.steps;
    result.custom.arrayHeader = [
      { key: 'name',     name: 'Load Step',   type: 'String' },
      { key: 'endTime',  name: 'End Time',     type: 'Number' },
      { key: 'progress', name: 'Progression',  type: 'Progress' },
    ];
  }

  // Populate result graph with non-empty series
  result.graph = Object.values(data).filter((s) => s.data.length > 0);
  result.markings = Object.values(markings);
  result.step = {
    lastIter: iteration,
    lastLine: i,
    ended: Number(startIter) === iteration,
  };

  next(null, result);
};

export default parser;
export const require = 'outputFile';
