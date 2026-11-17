import type { PreProcessorFn } from './types';

const stepLineRe = /^\s*\*Step,\s*name=(.+?),\s*nlgeom=.+/;
const massLineRe =
  /^\*.+? Mass Scaling,\s*dt=(.+?),\s*type=.+?,\s*frequency=.+?/;
const durationLineRe = /\s*([0-9\.\-\+eE]+)/;

export interface AbaqusStep {
  name: string;
  duration: number;
  timesteps: number;
  /** Added by post-processor */
  progress?: number;
  tsReal?: number;
  speed?: number;
  cpuTime?: number;
  walltime?: number;
  eff?: number;
}

/**
 * Dassault Abaqus pre-processor.
 * Parses the Abaqus input file (.inp) to extract step names, total durations,
 * and mass-scaling timestep targets, which the post-processor uses to compute
 * progress and speed estimates.
 */
const preParser: PreProcessorFn = function (files, init, next) {
  const steps: AbaqusStep[] = init || [];
  const durations: number[] = [];
  const timesteps: number[] = [];
  const fullSteps: AbaqusStep[] = [];

  const inputFile = files.inputFile;
  if (inputFile) {
    const inputLines = inputFile.split('\n');

    for (let i = 0; i < inputLines.length; i++) {
      const line = inputLines[i];

      const m = line.match(stepLineRe);
      if (m) {
        steps.push({ name: m[1], duration: 0, timesteps: 0 });
        const durMatch = inputLines[i + 2]?.match(durationLineRe);
        durations.push(durMatch ? Number(durMatch[1]) : 0);
        continue;
      }

      const n = line.match(massLineRe);
      if (n) {
        timesteps.push(Number(n[1]));
      }
    }

    for (let k = 0; k < steps.length; k++) {
      fullSteps.push({
        name:      steps[k].name,
        duration:  durations[k] ?? 0,
        timesteps: timesteps[k] ?? 0,
      });
    }
  }

  return next(null, fullSteps);
};

export default preParser;
