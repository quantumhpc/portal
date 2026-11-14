import type { ParserFn, ParserResult } from './types';
import type { AbaqusStep } from './dassault_abaqus_pre';

const incrementLineRe =
  /\s*([0-9]+)\s+([eE0-9\.\-\+]+)\s+([eE0-9\.\-\+]+)\s+([eE0-9\.\-\+:]+)\s+([eE0-9\.\-\+]+)\s+([0-9]+)\s+([eE0-9\.\-\+]+)\s+([eE0-9\.\-\+]+)\s+([eE0-9\.\-\+]+)/;
const dateLineRe =
  /\s+DATE\s+([0-9a-zA-Z\-ûé\.]+)\s+TIME\s+([0-9:]+)/;
const completedLineRe = /\s*THE ANALYSIS HAS COMPLETED SUCCESSFULLY/;

// French month names from Abaqus output (locale-dependent)
const MONTH_MAP: Record<string, string> = {
  'juin': 'Jun', 'juil.': 'Jul', 'août': 'Aug',  'sept.': 'Sep',
  'oct.': 'Oct', 'nov.':  'Nov', 'déc.': 'Dec',  'jan.':  'Jan',
  'févr.': 'Feb', 'mars': 'Mar', 'avr.': 'Apr',   'mai':   'May',
};

const RESULT_LABELS: Record<string, string> = {
  increment:   'INCREMENT',
  stepTime:    'STEP TIME',
  totTime:     'TOTAL TIME',
  cpuTime:     'CPU TIME',
  stableInc:   'STABLE INCREMENT',
  critElement: 'CRITICAL ELEMENT',
  kinEnergy:   'KINETIC ENERGY',
  totEnergy:   'TOTAL ENERGY',
  chngMass:    'PERCENT CHNG MASS',
};
const RESULT_KEYS = Object.keys(RESULT_LABELS);

/**
 * Dassault Abaqus explicit dynamics post-processor.
 * Always re-reads the full file (sets step.whole=true).
 * Extracts increment metrics and estimates per-step progress + time remaining
 * using the pre-processor step definitions.
 */
const parser: ParserFn = function (outputFile, _startLine, _startIter, preData, next) {
  const result: ParserResult = { graph: {}, markings: [], step: { lastLine: 0 } };

  // Initialise graph series
  const results: Record<string, { label: string; data: [number, number][] }> = {};
  for (const key of RESULT_KEYS) {
    results[key] = { label: RESULT_LABELS[key], data: [] };
  }

  const lines = outputFile.split('\n');
  let iteration = 0;
  let running = true;
  let currTotTime = 0;
  const dates: [number, number][] = [];
  let firstDate = true;
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i];

    const m = line.match(incrementLineRe);
    if (m) {
      iteration++;
      // Convert HH:MM:SS cpu time to seconds
      const cpuParts = m[4].split(/:/g);
      const cpuSec =
        parseInt(cpuParts[0], 10) * 3600 +
        parseInt(cpuParts[1], 10) * 60 +
        parseInt(cpuParts[2], 10);
      const vals = [m[1], m[2], m[3], String(cpuSec), m[5], m[6], m[7], m[8], m[9]];
      for (let k = 0; k < RESULT_KEYS.length; k++) {
        results[RESULT_KEYS[k]].data.push([iteration, Number(vals[k])]);
      }
      continue;
    }

    const n = line.match(dateLineRe);
    if (n) {
      if (firstDate) {
        firstDate = false;
      } else {
        const totTimeData = results.totTime.data;
        currTotTime =
          totTimeData.length > 0
            ? totTimeData[totTimeData.length - 1][1]
            : 0;
        const dayParts = n[1].split('-');
        const monthEn = MONTH_MAP[dayParts[1]] ?? dayParts[1];
        const stepDate =
          Date.parse(`${dayParts[0]}-${monthEn}-${dayParts[2]} ${n[2]}`) / 1000;
        dates.push([currTotTime, stepDate]);
      }
      continue;
    }

    if (line.match(completedLineRe)) {
      running = false;
    }
  }

  // --- Pre-data processing (progress / time estimates) ---
  const steps = preData as AbaqusStep[] | undefined;
  if (steps && Object.keys(steps).length > 0) {
    result.custom = { outputs: {} };

    if (running) {
      const totTimeData = results.totTime.data;
      currTotTime =
        totTimeData.length > 0
          ? totTimeData[totTimeData.length - 1][1]
          : 0;
      dates.push([currTotTime, Math.floor(Date.now() / 1000)]);
    }

    if (currTotTime !== 0) {
      const nbEl = results.totTime.data.length;

      // Instant velocity (simulation time / cpu time ratio)
      const vnCpu: number[] = [];
      for (let t = 1; t < nbEl; t++) {
        const dt = results.totTime.data[t][1] - results.totTime.data[t - 1][1];
        const dCpu = results.cpuTime.data[t][1] - results.cpuTime.data[t - 1][1];
        const prev = vnCpu[vnCpu.length - 1] ?? 0;
        vnCpu.push(dt !== 0 ? (dCpu / dt) * results.stableInc.data[t][1] : prev);
      }
      vnCpu.unshift(vnCpu[0]);

      // Cumulative step end times
      const stepEndTimes: number[] = [];
      let acc = 0;
      for (const step of steps) {
        acc += Number(step.duration);
        stepEndTimes.push(acc);
      }

      // Average velocity / stable increment per step
      const vnMoy: number[] = [];
      const siMoy: number[] = [];
      let el = 0, stepEl = 0, vnm = 0, arc = 0, sim = 0;
      while (el < nbEl) {
        vnm += vnCpu[el];
        sim += results.stableInc.data[el][1];
        arc++;
        if (results.totTime.data[el][1] === stepEndTimes[stepEl]) {
          vnMoy.push(vnm / arc);
          siMoy.push(sim / arc);
          steps[stepEl].progress = 100;
          stepEl++;
          vnm = 0; sim = 0; arc = 0;
        }
        el++;
      }

      // Partial progress for in-progress step
      if (results.totTime.data[nbEl - 1][1] < stepEndTimes[stepEndTimes.length - 1]) {
        vnMoy.push(vnm / arc);
        siMoy.push(sim / arc);
        const cur = results.totTime.data[nbEl - 1][1];
        const prev0 = stepEl > 0 ? stepEndTimes[stepEl - 1] : 0;
        steps[stepEl].progress =
          100 * (cur - prev0) / (stepEndTimes[stepEl] - prev0);
      }

      // Walltime / CPU estimates per step
      result.custom.outputs = {
        remainingWallTime: { label: 'Remaining Wall Time', value: 0, type: 'Time' },
        completedWallTime: { label: 'Elapsed Wall Time',   value: 0, type: 'Time' },
        remainingCpuTime:  { label: 'Remaining CPU Time',  value: 0, type: 'Time' },
        completedCpuTime:  { label: 'Elapsed CPU Time',    value: 0, type: 'Time' },
      };

      let rctSomme = 0, rctTi = 0;
      for (let s = 0; s < steps.length; s++) {
        const step = steps[s];
        step.duration  = Number(step.duration);
        step.timesteps = Number(step.timesteps);

        if (s < vnMoy.length) {
          step.tsReal = siMoy[s];
          step.speed  = vnMoy[s];
        } else {
          step.tsReal = step.timesteps;
          step.speed  = vnMoy[vnMoy.length - 1] ?? 0;
          step.progress = 0;
        }

        const cpuStep = Math.floor(
          (step.speed / Number(step.tsReal)) * step.duration,
        );
        step.cpuTime = cpuStep;

        const pc = (step.progress ?? 0) / 100;
        let ctStep: number;
        if (s <= dates.length - 2) {
          ctStep = pc > 0 ? (dates[s + 1][1] - dates[s][1]) / pc : 0;
          rctSomme += (ctStep / cpuStep) * (step.duration / Number(step.tsReal)) * pc;
          rctTi    += (step.duration / Number(step.tsReal)) * pc;
          const ratio = rctTi > 0 ? rctSomme / rctTi : 0;
          ctStep = ctStep * pc + (1 - pc) * cpuStep * ratio;
        } else {
          const ratio = rctTi > 0 ? rctSomme / rctTi : 1;
          ctStep = cpuStep * ratio;
        }
        step.walltime = ctStep;

        const remaining = (1 - pc) * ctStep;
        const elapsed   = pc * ctStep;
        (result.custom.outputs!.remainingWallTime as any).value += remaining;
        (result.custom.outputs!.completedWallTime as any).value += elapsed;
        (result.custom.outputs!.remainingCpuTime  as any).value += (1 - pc) * cpuStep;
        (result.custom.outputs!.completedCpuTime  as any).value += pc * cpuStep;

        step.eff   = cpuStep > 0 ? cpuStep / ctStep : 0;
        step.speed = 1 / Number(step.speed);
      }

      const remWall = (result.custom.outputs.remainingWallTime as any).value as number;
      if (remWall > 0) {
        const expectedEnd = new Date();
        expectedEnd.setSeconds(expectedEnd.getSeconds() + remWall);
        result.custom.message = {
          text: `Computation expected end: ${expectedEnd.toUTCString()}`,
          type: 'info',
        };
      } else {
        result.custom.message = { text: 'Computation terminated', type: 'success' };
      }
    } else {
      result.custom.message = { text: 'No result yet.', type: 'warning' };
    }

    result.custom.array = steps;
    result.custom.arrayHeader = [
      { key: 'name',      name: 'Step-Name',   type: 'String'     },
      { key: 'duration',  name: 'Duration',     type: 'Number'     },
      { key: 'timesteps', name: 'Desired TS',   type: 'Scientific' },
      { key: 'progress',  name: 'Progression',  type: 'Progress'   },
      { key: 'tsReal',    name: 'Real TS',       type: 'Scientific' },
      { key: 'speed',     name: 'Speed',         type: 'Number'     },
      { key: 'cpuTime',   name: 'CPU Time',      type: 'Time'       },
      { key: 'walltime',  name: 'Walltime',      type: 'Time'       },
      { key: 'eff',       name: 'Efficiency',    type: 'Number'     },
    ];
  }

  result.graph = results;
  result.step = {
    lastIter: iteration,
    lastLine: i,
    whole: true,
    terminated: !running,
  };

  return next(null, result);
};

export default parser;
export const require = 'outputFile';
