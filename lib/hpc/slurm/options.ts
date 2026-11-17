/**
 * Job-form field keys that become `#SBATCH` options.
 *
 * A template field with one of these keys needs no placeholder in the command:
 * the value goes into the job script header. The admin "Add to form" presets
 * (lib/field-presets.ts) use these keys. No Node imports: the browser reads this too.
 */

type Kind = 'int' | 'gb' | 'word';

/** key → sbatch option and the kind of value it takes. */
export const SLURM_OPTIONS: Record<string, { option: string; kind: Kind }> = {
  nodes: { option: 'nodes', kind: 'int' },
  ntasks: { option: 'ntasks', kind: 'int' },
  ntasksPerNode: { option: 'ntasks-per-node', kind: 'int' },
  memPerCpu: { option: 'mem-per-cpu', kind: 'gb' },
  tmp: { option: 'tmp', kind: 'gb' },
  account: { option: 'account', kind: 'word' },
  qos: { option: 'qos', kind: 'word' },
  constraint: { option: 'constraint', kind: 'word' },
  reservation: { option: 'reservation', kind: 'word' },
  nodelist: { option: 'nodelist', kind: 'word' },
  exclude: { option: 'exclude', kind: 'word' },
  array: { option: 'array', kind: 'word' },
  dependency: { option: 'dependency', kind: 'word' },
  begin: { option: 'begin', kind: 'word' },
};

/** Keys the submit code reads itself (lib/hpc/managers.ts, slurm/index.ts). */
export const SLURM_BUILTIN_KEYS: Record<string, string> = {
  mem: '--mem',
  gpus: '--gres=gpu:[<type>:]N',
  gpu: '--gres=gpu:<type>:N',
  walltimeHours: '--time',
  walltimeMinutes: '--time',
  exclusive: '--exclusive',
  mail: '--mail-user',
  mailBegins: '--mail-type=BEGIN',
  mailTerminates: '--mail-type=END',
  mailAbort: '--mail-type=FAIL',
  outputFile: '--output',
};

/** The sbatch option a field key sets, or undefined for an ordinary field. */
export function slurmOptionFor(key: string): string | undefined {
  return SLURM_OPTIONS[key] ? `--${SLURM_OPTIONS[key].option}` : SLURM_BUILTIN_KEYS[key];
}

// One header line per option: no spaces, quotes, newlines or shell characters.
const SAFE = /^[A-Za-z0-9_.,:@%+\-\/=\[\]*]+$/;
// --constraint also takes & and | (AND, OR). The header line is not run by the shell.
const CONSTRAINT = /^[A-Za-z0-9_.,:@%+\-\/=\[\]*&|]+$/;
const set = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== false;

export function positiveInt(name: string, v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number above 0`);
  return n;
}

function safeWord(name: string, v: unknown, allowed = SAFE): string {
  const s = String(v).trim();
  if (!allowed.test(s)) throw new Error(`${name} contains characters that are not allowed`);
  return s;
}

/** `--key=value` resources for the sbatch script, from the submitted job args. Throws on a bad value. */
export function slurmResources(jobArgs: Record<string, any>): Record<string, string | number> {
  const res: Record<string, string | number> = { 'cpus-per-task': positiveInt('Processors', jobArgs.numProcs ?? 1) };
  if (set(jobArgs.mem) && set(jobArgs.memPerCpu)) throw new Error('Set memory per node or memory per core, not both');
  if (set(jobArgs.mem)) res.mem = positiveInt('Memory', jobArgs.mem) + 'gb';
  // 0 GPUs means no GPU, even when a GPU type is set.
  if ((set(jobArgs.gpu) || set(jobArgs.gpus)) && String(jobArgs.gpus).trim() !== '0') {
    const gpu = set(jobArgs.gpu) ? String(jobArgs.gpu).trim() : '';
    // No ':' in the type: it would shift the count into the type slot.
    if (gpu && !/^[A-Za-z0-9_.-]+$/.test(gpu)) throw new Error('GPU type must be a single name, for example a100');
    const type = gpu ? `:${gpu}` : '';
    res.gres = `gpu${type}:${set(jobArgs.gpus) ? positiveInt('GPUs', jobArgs.gpus) : 1}`;
  }
  for (const [key, { option, kind }] of Object.entries(SLURM_OPTIONS)) {
    const v = jobArgs[key];
    if (!set(v)) continue;
    res[option] = kind === 'int' ? positiveInt(option, v) : kind === 'gb' ? positiveInt(option, v) + 'G' : safeWord(option, v, key === 'constraint' ? CONSTRAINT : SAFE);
  }
  return res;
}

function wholeNumber(name: string, v: unknown): number {
  if (!set(v)) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number`);
  return n;
}

/** Checks the fields both schedulers write into the script header. Throws on a bad value. */
export function checkJobArgs(jobArgs: Record<string, any>): void {
  wholeNumber('Time limit hours', jobArgs.walltimeHours);
  if (wholeNumber('Time limit minutes', jobArgs.walltimeMinutes) > 59) throw new Error('Time limit minutes must be between 0 and 59');
  if (set(jobArgs.mail)) {
    jobArgs.mail = String(jobArgs.mail).trim();
    if (!/^[^\s@,]+@[^\s@,]+$/.test(jobArgs.mail)) throw new Error('Email address is not valid');
  }
  // A file name in the job folder. Slurm patterns such as %j stay allowed.
  if (set(jobArgs.outputFile) && (!/^[A-Za-z0-9_.%+-]+$/.test(String(jobArgs.outputFile)) || /^\.+$/.test(String(jobArgs.outputFile)))) {
    throw new Error('Output file name must be a plain file name, without folders or spaces');
  }
}
