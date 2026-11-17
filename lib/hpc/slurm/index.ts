/**
 * SLURM Scheduler API
 * Ported from api/slurmjs/slurmjs.js
 *
 * Provides job, node, and partition management for SLURM clusters.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  spawnProcess,
  getMountedPath as hpcGetMountedPath,
  getOriginalPath as hpcGetOriginalPath,
  createJobWorkDir as hpcCreateJobWorkDir,
  type HpcConfig,
  type SpawnResult,
} from '../exec';
import { jobsFromJson, nodesFromJson, partitionsFromJson, queueFromJson } from './json';
import { queryJsonOrText } from '../json-query';

const cmdDict: Record<string, string[]> = {
  partitions: ['scontrol', 'show', 'partition'],
  queue:      ['squeue', '--format=%all', '-p'],
  queues:     ['squeue', '--format=%all'],
  nodes:      ['scontrol', 'show', 'nodes'],
  job:        ['scontrol', 'show', 'job'],
  // --parsable: print only "<id>[;<cluster>]" instead of "Submitted batch job <id>"
  submit:     ['sbatch', '--parsable'],
};

const sActions: Record<string, string> = {
  scancel: 'successfully cancelled',
  hold: 'successfully held',
  release: 'successfully released',
  requeue: 'successfully requeued',
};

const slurmSep = '|';

function cmdBuilder(binPath: string, cmdDictElement: string[]): string[] {
  return [path.join(binPath, cmdDictElement[0]), ...cmdDictElement.slice(1)];
}

// --- Path helpers ---

export function getMountedPath(config: HpcConfig, remotePath: string): string | null {
  return hpcGetMountedPath(config, remotePath);
}

export function getOriginalPath(config: HpcConfig, remotePath: string): string {
  return hpcGetOriginalPath(config, remotePath);
}

export async function createJobWorkDir(config: HpcConfig, folderHint?: string) {
  return hpcCreateJobWorkDir(config, folderHint);
}

// --- JSON parsers ---

function jsonifyParams(output: string): Record<string, string> {
  const results: Record<string, string> = {};
  let param: RegExpExecArray | null;
  // Reset regex state
  const regex = /([^=\s]+)=(.+?)(?=\s+[a-zA-Z]+=|$)/gm;
  while ((param = regex.exec(output)) !== null) {
    results[param[1]] = param[2];
  }
  return results;
}

function jsonifyParsable(output: string[]): any[] {
  const results: any[] = [];
  if (output.length === 0) return results;

  const header = output.shift()!.split(slurmSep);
  for (const line of output) {
    if (line && line.length > 0) {
      const result: any = {};
      const entry = line.split(slurmSep);
      for (let j = 0; j < entry.length; j++) {
        if (header[j] && header[j].length > 0) {
          result[header[j]] = entry[j];
        }
      }
      results.push(result);
    }
  }
  return results;
}

// --- JSON or text ---

/**
 * Run a Slurm query, preferring native JSON (`--json`, Slurm ≥ 21.08). `--json`
 * goes right after the binary: scontrol only takes options before its command.
 */
function slurmQuery(
  config: HpcConfig,
  binary: string,
  jsonArgs: string[],
  textArgs: string[]
): { json: any } | { text: string } {
  const res = queryJsonOrText(config, binary, ['--json', ...jsonArgs], textArgs);
  const err = 'json' in res ? res.json.errors?.[0] : undefined;
  if (err) throw new Error(err.description || err.error || `${binary} failed`);
  return res;
}

const textBlocks = (stdout: string) =>
  stdout.split(os.EOL + os.EOL).filter((c) => c.trim().length > 0).map(jsonifyParams);

// --- Main API functions ---

/** Get the working directory for a job */
export async function getJobWorkDir(config: HpcConfig, jobId: string): Promise<string> {
  const data = await scontrolJob(config, jobId);
  const workDir = data?.WorkDir;
  if (!workDir) throw new Error('Working directory not found');

  return config.useSharedDir
    ? getMountedPath(config, path.resolve(workDir))!
    : path.resolve(workDir);
}

/** Get job info via scontrol */
export async function scontrolJob(config: HpcConfig, jobId: string): Promise<any> {
  const [bin, ...args] = cmdDict.job;
  const res = slurmQuery(config, bin, [...args, jobId], [...args, jobId]);
  if ('json' in res) return jobsFromJson(res.json)[0] ?? null;
  if (!res.text || res.text.length === 0) return null;
  return jsonifyParams(res.text);
}

/** List or query SLURM nodes */
export async function snodes(
  config: HpcConfig,
  nodeName?: string
): Promise<any> {
  const [bin, ...args] = cmdDict.nodes;
  const target = nodeName ? [nodeName] : [];
  const res = slurmQuery(config, bin, [...args, ...target], [...args, ...target]);
  const nodes: any[] = 'json' in res ? nodesFromJson(res.json) : textBlocks(res.text);
  // scontrol doesn't list a node's jobs: take the running ones from squeue.
  const running = (await squeue(config)).filter((j) => /^(R|RUNNING)$/.test(j.STATE ?? j.ST ?? ''));
  for (const node of nodes) {
    node.jobs = running
      .filter((j) => expandHostlist(j['NODELIST(REASON)'] ?? j.NODELIST ?? '').includes(node.NodeName))
      .map((j) => ({ jobId: String(j.JOBID), jobProcs: String(Math.round(Number(j.CPUS) / Number(j.NODES || 1)) || '') }));
  }
  return nodes;
}

/** "c[1-3,5],gpu01" → ["c1", "c2", "c3", "c5", "gpu01"] (keeps zero padding). */
export function expandHostlist(list: string): string[] {
  // shortcut: one bracket group per name, enough for typical clusters; use `scontrol show hostnames` if needed.
  return (list.match(/[^,[]+(\[[^\]]*\])?[^,]*/g) ?? []).flatMap((part) => {
    const m = part.match(/^([^[]*)\[([^\]]*)\](.*)$/);
    if (!m) return [part];
    return m[2].split(',').flatMap((range) => {
      const [a, b = a] = range.split('-');
      const out: string[] = [];
      for (let i = Number(a); i <= Number(b); i++) out.push(m[1] + String(i).padStart(a.length, '0') + m[3]);
      return out;
    });
  });
}

/** List SLURM partitions */
export async function spartitions(
  config: HpcConfig,
  partitionName?: string
): Promise<any[]> {
  const [bin, ...args] = cmdDict.partitions;
  const target = partitionName ? [partitionName] : [];
  const res = slurmQuery(config, bin, [...args, ...target], [...args, ...target]);
  return 'json' in res ? partitionsFromJson(res.json) : textBlocks(res.text);
}

/** List jobs in the queue via squeue */
export async function squeue(
  config: HpcConfig,
  partitionName?: string
): Promise<any[]> {
  const one = partitionName && partitionName !== 'all' ? partitionName : null;
  const [bin, ...textArgs] = one ? [...cmdDict.queue, one] : cmdDict.queues;
  const res = slurmQuery(config, bin, one ? ['-p', one] : [], textArgs);
  if ('text' in res) return jsonifyParsable(res.text.split(os.EOL));
  // Filter here too: some releases ignore -p with --json.
  return queueFromJson(res.json).filter((j) => !one || j.PARTITION === one);
}

/** Generate a SLURM submission script (sbatch) */
export interface SlurmJobArgs {
  shell?: string;
  jobName: string;
  resources: Record<string, string | number>;
  walltime?: string;
  stdout?: string;
  stderr?: string;
  queue?: string;
  exclusive?: boolean;
  mail?: string;
  mailAbort?: boolean;
  mailBegins?: boolean;
  mailTerminates?: boolean;
  commands: string;
  env?: Record<string, string>;
}

export async function sscript(
  jobArgs: SlurmJobArgs,
  localPath: string
): Promise<{ message: string; path: string }> {
  const SBATCH = '#SBATCH ';
  let toWrite = '#!';

  // Shell
  toWrite += jobArgs.shell || '/bin/bash';

  if (jobArgs.jobName.search(/[^a-zA-Z0-9]/g) !== -1) {
    throw new Error('Name cannot contain special characters');
  }

  const scriptFullPath = path.join(localPath, jobArgs.jobName);

  // Job name
  toWrite += os.EOL + SBATCH + '--job-name=' + jobArgs.jobName;

  if (jobArgs.stdout) toWrite += os.EOL + SBATCH + '--output=' + jobArgs.stdout;
  if (jobArgs.stderr) toWrite += os.EOL + SBATCH + '--error=' + jobArgs.stderr;

  // Resources: loop on object and pass as-is
  for (const key in jobArgs.resources) {
    const val = jobArgs.resources[key];
    if (val !== undefined && val !== '') {
      toWrite += os.EOL + SBATCH + '--' + key + '=' + val;
    }
  }

  if (jobArgs.walltime) {
    toWrite += os.EOL + SBATCH + '--time=' + jobArgs.walltime;
  }
  if (jobArgs.queue) {
    toWrite += os.EOL + SBATCH + '--partition=' + jobArgs.queue;
  }
  if (jobArgs.exclusive) {
    toWrite += os.EOL + SBATCH + '--exclusive';
  }

  // Environment variables
  if (jobArgs.env) {
    const jobEnv: string[] = [];
    for (const key in jobArgs.env) {
      if (key === 'ALL') {
        jobEnv.unshift('ALL');
      } else {
        jobEnv.push(`${key}=${jobArgs.env[key]}`);
      }
    }
    toWrite += os.EOL + SBATCH + '--export=' + jobEnv.join(',');
  }

  // Mail notifications
  if (jobArgs.mail) {
    toWrite += os.EOL + SBATCH + '--mail-user=' + jobArgs.mail;
    const mailTypes: string[] = [];
    if (jobArgs.mailAbort) mailTypes.push('FAIL');
    if (jobArgs.mailBegins) mailTypes.push('BEGIN');
    if (jobArgs.mailTerminates) mailTypes.push('END');
    if (mailTypes.length > 0) {
      toWrite += os.EOL + SBATCH + '--mail-type=' + mailTypes.join(',');
    }
  }

  // Commands
  toWrite += os.EOL + jobArgs.commands + os.EOL;

  // Write script
  try { fs.unlinkSync(scriptFullPath); } catch { /* ignore */ }
  // wx (O_EXCL): fail instead of following a symlink planted in the user-owned job dir.
  fs.writeFileSync(scriptFullPath, toWrite, { flag: 'wx' });

  return {
    message: `Script for job ${jobArgs.jobName} successfully created`,
    path: scriptFullPath,
  };
}

/** Submit a job via sbatch */
export async function sbatch(
  config: HpcConfig,
  sbatchArgs: string[],
  jobWorkingDir: string
): Promise<{ message: string; jobId: string; path: string }> {
  if (sbatchArgs.length < 1) {
    throw new Error('Please submit the script to run');
  }

  const mountedPath = getMountedPath(config, jobWorkingDir);

  // Copy files to working directory
  for (const file of sbatchArgs) {
    const normFile = path.normalize(file);
    if (
      !normFile.startsWith(jobWorkingDir) &&
      (!mountedPath || !normFile.startsWith(mountedPath))
    ) {
      const copyResult = spawnProcess([file, jobWorkingDir], 'copy', true, config);
      if (copyResult !== true && copyResult.stderr) {
        throw new Error(copyResult.stderr.replace(/\n/g, ''));
      }
    }
  }

  // Build submit command
  const scriptName = path.basename(sbatchArgs[0]);
  let remote_cmd = cmdBuilder(config.binariesDir, cmdDict.submit);
  remote_cmd.push(scriptName);
  remote_cmd = ['cd', jobWorkingDir, '&&', ...remote_cmd];

  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr.replace(/\n/g, ''));
  }

  const jobId = (output as SpawnResult).stdout.trim().split(';')[0];
  return {
    message: `Job ${jobId} submitted`,
    jobId,
    path: jobWorkingDir,
  };
}

/** Find files in a job's working directory */
export async function sfind(
  config: HpcConfig,
  jobId: string
): Promise<{ files: string[]; folders: string[] }> {
  const jobWorkingDir = await getJobWorkDir(config, jobId);

  const remote_cmd = ['find', jobWorkingDir, '-type f', '&& find', jobWorkingDir, '-type d'];
  const output = spawnProcess(remote_cmd, 'shell', config.useSharedDir, config);

  if (output !== true && output.stderr) {
    throw new Error(output.stderr.replace(/\n/g, ''));
  }

  const lines = (output as SpawnResult).stdout.split(os.EOL);
  const fileList = { files: [] as string[], folders: [] as string[] };
  let isFiles = true;

  for (const line of lines) {
    if (line.length > 0) {
      if (path.resolve(line) === path.resolve(jobWorkingDir)) {
        isFiles = false;
      }
      if (isFiles) {
        fileList.files.push(path.resolve(line));
      } else {
        fileList.folders.push(path.resolve(line));
      }
    }
  }

  return fileList;
}

/** Retrieve job files to a local directory */
export async function sretrieve(
  config: HpcConfig,
  jobId: string,
  fileList: string[],
  localDir: string
): Promise<{ message: string }> {
  const jobWorkingDir = await getJobWorkDir(config, jobId);

  for (const filePath of fileList) {
    if (path.relative(jobWorkingDir, filePath).indexOf('..') > -1) {
      throw new Error(`${path.basename(filePath)} is not related to the job ${jobId}`);
    }
    const copyResult = spawnProcess([filePath, localDir], 'copy', false, config);
    if (copyResult !== true && copyResult.stderr) {
      throw new Error(copyResult.stderr.replace(/\n/g, ''));
    }
  }

  return { message: `Files for the job ${jobId} have all been retrieved in ${localDir}` };
}

// --- Simple job action wrappers ---

async function sFn(
  action: string,
  msg: string,
  config: HpcConfig,
  jobId: string
): Promise<{ message: string }> {
  const remote_cmd = cmdBuilder(config.binariesDir, [action]);
  remote_cmd.push(jobId);

  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr);
  }
  return { message: `Job ${jobId} ${msg}` };
}

export async function scancel(config: HpcConfig, jobId: string) {
  return sFn('scancel', sActions.scancel, config, jobId);
}

// --- scontrol-based job control ---

async function scontrolFn(
  config: HpcConfig,
  args: string[],
  message: string
): Promise<{ message: string }> {
  const remote_cmd = cmdBuilder(config.binariesDir, ['scontrol', ...args]);

  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr);
  }
  return { message };
}

export async function shold(config: HpcConfig, jobId: string) {
  return scontrolFn(config, ['hold', jobId], `Job ${jobId} ${sActions.hold}`);
}

export async function srelease(config: HpcConfig, jobId: string) {
  return scontrolFn(config, ['release', jobId], `Job ${jobId} ${sActions.release}`);
}

export async function srequeue(config: HpcConfig, jobId: string) {
  return scontrolFn(config, ['requeue', jobId], `Job ${jobId} ${sActions.requeue}`);
}

/** Move a job to a different partition (scontrol update Partition=) */
export async function smove(config: HpcConfig, jobId: string, destination: string) {
  return scontrolFn(
    config,
    ['update', `JobId=${jobId}`, `Partition=${destination}`],
    `Job ${jobId} successfully moved to ${destination}`
  );
}

/** Alter job attributes (scontrol update) */
export interface SlurmAlterArgs {
  jobName?: string;
  priority?: number | string;
  walltime?: string;
}

export async function salter(config: HpcConfig, jobId: string, jobArgs: SlurmAlterArgs) {
  const updates: string[] = [];
  if (jobArgs.jobName) updates.push(`JobName=${jobArgs.jobName}`);
  if (jobArgs.priority !== undefined && jobArgs.priority !== null && jobArgs.priority !== '') {
    updates.push(`Priority=${jobArgs.priority}`);
  }
  if (jobArgs.walltime) updates.push(`TimeLimit=${jobArgs.walltime}`);
  if (updates.length === 0) throw new Error('Nothing to alter');

  return scontrolFn(
    config,
    ['update', `JobId=${jobId}`, ...updates],
    `Job ${jobId} successfully altered`
  );
}
