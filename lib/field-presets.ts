/**
 * Ready-made additions for the admin job-form editor ("Add to form").
 *
 * A preset is data: the fields it adds, their default values, and the text it
 * appends to the main command or the prologue. Scheduler presets use the field
 * keys that the submit code turns into `#SBATCH` options (lib/hpc/slurm/options.ts),
 * so they need no command text. To add a preset, add one entry to PRESETS.
 */

import type { TemplateField } from '@/lib/hpc/job-template';
import { SLURM_BUILTIN_KEYS, SLURM_OPTIONS } from '@/lib/hpc/slurm/options';

export interface FieldPreset {
  id: string;
  group: string;
  title: string;
  description: string;
  /** Works only with this scheduler. */
  scheduler?: 'slurm';
  fields: Record<string, TemplateField>;
  defaults?: Record<string, unknown>;
  /** Appended to the main command. */
  command?: string;
  /** Appended to the prologue commands. */
  prologue?: string;
}

export interface FormDraft {
  fields: Record<string, any>;
  parameters: Record<string, any>;
}

const text = (label: string, caption = ''): TemplateField => ({ type: 'textField', label, caption, required: false });
const tick = (label: string, caption: string): TemplateField => ({ type: 'checkbox', label, caption, required: false });

const RESOURCES = 'Resources';
const SCHEDULING = 'Scheduling';
const NOTIFY = 'Notifications';
const ENV = 'Paths and environment';
const APP = 'Application options';

function slurm(group: string, id: string, title: string, description: string, fields: Record<string, TemplateField>, defaults?: Record<string, unknown>): FieldPreset {
  return { id, group, title, description, scheduler: 'slurm', fields, defaults };
}

/** Works on PBS too: the submit code reads these keys for both schedulers. */
function both(group: string, id: string, title: string, description: string, fields: Record<string, TemplateField>, defaults?: Record<string, unknown>): FieldPreset {
  return { id, group, title, description, fields, defaults };
}

export const PRESETS: FieldPreset[] = [
  // --- Resources ---
  both(RESOURCES, 'walltime', 'Time limit', 'Hours and minutes after which the scheduler stops the job.',
    { walltimeHours: text('Time limit: hours'), walltimeMinutes: text('Time limit: minutes') },
    { walltimeHours: '1', walltimeMinutes: '0' }),
  both(RESOURCES, 'mem', 'Memory per node', 'Memory in GB on each node.', { mem: text('Memory per node (GB)') }, { mem: '4' }),
  slurm(RESOURCES, 'memPerCpu', 'Memory per core', 'Memory in GB for each core (--mem-per-cpu). Do not combine with memory per node.',
    { memPerCpu: text('Memory per core (GB)') }),
  slurm(RESOURCES, 'nodes', 'Number of nodes', 'How many nodes the job runs on (--nodes).', { nodes: text('Nodes') }, { nodes: '1' }),
  slurm(RESOURCES, 'ntasks', 'Number of tasks', 'MPI tasks in total (--ntasks). The Processors field sets the cores of each task.',
    { ntasks: text('Tasks (MPI processes)') }),
  slurm(RESOURCES, 'ntasksPerNode', 'Tasks per node', 'MPI tasks on each node (--ntasks-per-node).', { ntasksPerNode: text('Tasks per node') }),
  slurm(RESOURCES, 'gpus', 'GPUs', 'Number of GPUs, 0 for none (--gres=gpu:N, or gpu:type:N with a GPU type).', { gpus: text('GPUs') }, { gpus: '1' }),
  slurm(RESOURCES, 'gpu', 'GPU type', 'GPU model as named on the cluster, for example a100 (--gres=gpu:type:N).', { gpu: text('GPU type', 'e.g. a100') }),
  slurm(RESOURCES, 'tmp', 'Local scratch disk', 'Minimum free temporary disk in GB on each node (--tmp).', { tmp: text('Local scratch disk (GB)') }),
  both(RESOURCES, 'exclusive', 'Whole nodes', 'Do not share the nodes with other jobs.',
    { exclusive: tick('Whole nodes', 'Do not share nodes with other jobs') }),

  // --- Scheduling ---
  slurm(SCHEDULING, 'account', 'Account', 'Project or account the job is charged to (--account).', { account: text('Account') }),
  slurm(SCHEDULING, 'qos', 'Quality of service', 'QOS name (--qos).', { qos: text('Quality of service (QOS)') }),
  slurm(SCHEDULING, 'constraint', 'Node features', 'Run only on nodes with these features (--constraint).', { constraint: text('Node features', 'e.g. avx512') }),
  slurm(SCHEDULING, 'reservation', 'Reservation', 'Use a named reservation (--reservation).', { reservation: text('Reservation') }),
  slurm(SCHEDULING, 'nodelist', 'Specific nodes', 'Run on these nodes (--nodelist).', { nodelist: text('Run on nodes', 'e.g. c[1-4]') }),
  slurm(SCHEDULING, 'exclude', 'Excluded nodes', 'Never run on these nodes (--exclude).', { exclude: text('Exclude nodes', 'e.g. c7') }),
  slurm(SCHEDULING, 'array', 'Job array', 'Run the job once per index (--array).', { array: text('Array indexes', 'e.g. 1-10 or 1-100%5') }),
  slurm(SCHEDULING, 'dependency', 'Start after another job', 'Wait for another job (--dependency).', { dependency: text('Depends on', 'e.g. afterok:1234') }),
  slurm(SCHEDULING, 'begin', 'Start time', 'Do not start before this time (--begin).', { begin: text('Start no earlier than', 'e.g. 2026-12-01T08:00 or now+1hour') }),

  // --- Notifications ---
  both(NOTIFY, 'mail', 'Email notifications', 'An address and the events to send mail for.', {
    mail: text('Email address'),
    mailBegins: tick('Email when', 'The job starts'),
    mailTerminates: tick('', 'The job ends'),
    mailAbort: tick('', 'The job fails'),
  }),

  // --- Paths and environment ---
  { id: 'outputFile', group: ENV, title: 'Output file name', description: 'Name of the file that receives the job output.',
    fields: { outputFile: text('Output file name') }, defaults: { outputFile: 'output.log' } },
  { id: 'extraFiles', group: ENV, title: 'Extra input files', description: 'More files to upload. They are copied next to the input file.',
    fields: { extraFiles: { type: 'file', label: 'Extra input files', multiple: true, switch: true, required: false } } },
  { id: 'modules', group: ENV, title: 'Environment modules', description: 'Runs "module load" with these names before the application.',
    fields: { modules: text('Modules to load', 'e.g. gcc/13 openmpi/5') }, prologue: '(module load VAR.modules)' },
  { id: 'condaEnv', group: ENV, title: 'Conda environment', description: 'Runs "conda activate" before the application.',
    fields: { condaEnv: text('Conda environment') }, prologue: '(conda activate VAR.condaEnv)' },
  { id: 'ompThreads', group: ENV, title: 'OpenMP threads', description: 'Sets OMP_NUM_THREADS before the application.',
    fields: { ompThreads: text('OpenMP threads') }, prologue: '(export OMP_NUM_THREADS=VAR.ompThreads)' },
  { id: 'scratchDir', group: ENV, title: 'Scratch folder', description: 'Sets TMPDIR to this folder before the application.',
    fields: { scratchDir: text('Scratch folder', 'e.g. /scratch/$USER') }, prologue: '(export TMPDIR=VAR.scratchDir)' },
  { id: 'extraArgs', group: ENV, title: 'Extra command-line arguments', description: 'Free text added to the end of the command.',
    fields: { extraArgs: text('Extra arguments') }, command: 'VAR.extraArgs' },

  // --- Application options: check the values against the application's manual. ---
  { id: 'precision', group: APP, title: 'Precision', description: 'Single or double precision. Check the values for your application.',
    fields: { precision: { type: 'radioButtons', label: 'Precision', required: true, radios: { single: { caption: 'Single', value: '' }, double: { caption: 'Double', value: '-dp' } } } },
    defaults: { precision: '' }, command: 'VAR.precision' },
  { id: 'dimension', group: APP, title: 'Dimension', description: '2D or 3D. Check the values for your application.',
    fields: { dimension: { type: 'radioButtons', label: 'Dimension', required: true, radios: { d2: { caption: '2D', value: '2d' }, d3: { caption: '3D', value: '3d' } } } },
    defaults: { dimension: '3d' }, command: 'VAR.dimension' },
  { id: 'mpi', group: APP, title: 'MPI library', description: 'Which MPI the application uses. Check the values for your application.',
    fields: { mpi: { type: 'radioButtons', label: 'MPI library', required: true, radios: { openmpi: { caption: 'Open MPI', value: 'openmpi' }, intel: { caption: 'Intel MPI', value: 'intel' } } } },
    defaults: { mpi: 'openmpi' }, command: '(-mpi=VAR.mpi)' },
];

/** Build-your-own presets: the admin gives a label and the command-line text. */
export const CUSTOM_KINDS = [
  { kind: 'flag', title: 'Command-line flag (yes / no)', description: 'A tick box that adds text to the command, for example -gpu.', cliLabel: 'Text added when ticked', cliHint: '-gpu' },
  { kind: 'choice', title: 'Choice from a list', description: 'One of several values. Add the options after inserting.', cliLabel: 'Text before the value (optional)', cliHint: '-solver' },
  { kind: 'text', title: 'Text or number', description: 'A value the user types, for example a number of iterations.', cliLabel: 'Text before the value (optional)', cliHint: '-iter' },
  { kind: 'file', title: 'File', description: 'A file the user uploads. Its name is added to the command.', cliLabel: 'Text before the file name (optional)', cliHint: '-restart' },
] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number]['kind'];

// Keys the form and the submit code already use.
const RESERVED = new Set([
  'appDomain', 'appName', 'type', 'jobName', 'numProcs', 'procs', 'queue', 'version', 'appBinaries', 'inputFile', 'inputFileName',
  'inputFileSource', 'scriptCommands', 'mainCommand', 'commands', 'resources', 'env', 'licenses', 'workdir', 'walltime', 'priority',
  ...Object.keys(SLURM_OPTIONS), ...Object.keys(SLURM_BUILTIN_KEYS),
]);

/** A field key from a label: letters and digits, camelCase, not reserved, not in `taken`. */
export function keyFromLabel(label: string, taken: Record<string, unknown> = {}): string {
  const words = label.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
  if (!/^[a-z]/.test(key)) key = `option${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`;
  let out = key;
  for (let n = 2; RESERVED.has(out) || out in taken || `use${out}` in taken; n++) out = `${key}${n}`;
  return out;
}

/** Preset for a field the admin describes with a label and command-line text. */
export function customPreset(kind: CustomKind, label: string, cli: string, taken: Record<string, unknown> = {}): FieldPreset {
  const key = keyFromLabel(label, taken);
  const prefix = cli.trim();
  const valued = prefix ? `(${prefix} VAR.${key})` : `(VAR.${key})`;
  const base = { id: key, group: 'Custom', title: label, description: '' };
  switch (kind) {
    case 'flag':
      return { ...base, fields: { [key]: { type: 'checkbox', label, caption: label, required: false, value: { true: prefix, false: '' } } }, command: `VAR.${key}` };
    case 'choice':
      return { ...base, fields: { [key]: { type: 'radioButtons', label, required: false, radios: {} } }, command: valued };
    case 'file':
      return { ...base, fields: { [key]: { type: 'file', label, switch: true, required: false } }, command: valued };
    default:
      return { ...base, fields: { [key]: { type: 'textField', label, caption: '', required: false } }, command: valued };
  }
}

/** True when every field of the preset is already in the form. */
export function presetAdded(preset: FieldPreset, draft: FormDraft): boolean {
  return Object.keys(preset.fields).every((k) => k in draft.fields);
}

/** The draft with the preset added. Existing fields, defaults and command text are kept. */
export function applyPreset(draft: FormDraft, preset: FieldPreset): FormDraft {
  const parameters = { ...draft.parameters };
  const fields = { ...draft.fields };
  for (const [k, f] of Object.entries(preset.fields)) if (!(k in fields)) fields[k] = structuredClone(f);
  if (preset.defaults) parameters.default = { ...preset.defaults, ...(parameters.default ?? {}) };
  if (preset.command && !String(parameters.mainCommand ?? '').includes(preset.command)) {
    parameters.mainCommand = `${parameters.mainCommand ?? ''} ${preset.command}`.trim();
  }
  if (preset.prologue) {
    const lines: string[] = Array.isArray(parameters.prologueCommands) ? parameters.prologueCommands : parameters.prologueCommands ? [String(parameters.prologueCommands)] : [];
    if (!lines.includes(preset.prologue)) parameters.prologueCommands = [...lines, preset.prologue];
  }
  return { fields, parameters };
}

/** How a field reaches the job: a scheduler option, the command, or nothing yet. */
export function fieldUsage(key: string, field: { type?: string } | undefined, parameters: Record<string, any>): { used: boolean; text: string } {
  const option = SLURM_BUILTIN_KEYS[key] ?? (SLURM_OPTIONS[key] && `--${SLURM_OPTIONS[key].option}`);
  if (option) return { used: true, text: `Sets the scheduler option (Slurm: ${option})` };
  const where = new RegExp(`VAR\\.${key}\\b`);
  const { mainCommand, prologueCommands, epilogueCommands, default: defaults } = parameters ?? {};
  if (where.test(String(mainCommand ?? ''))) return { used: true, text: `Used in the main command as VAR.${key}` };
  if (where.test(JSON.stringify([prologueCommands, epilogueCommands, defaults]))) return { used: true, text: `Used in the job script as VAR.${key}` };
  if (field?.type === 'file') return { used: true, text: 'Copied to the job folder. Not named in the command.' };
  return { used: false, text: 'Not used in the command yet' };
}
