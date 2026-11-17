/**
 * PBS/Pro Scheduler API
 * Ported from api/pbsjs/pbsjs.js
 *
 * Provides job, node, and queue management for PBS Professional clusters.
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
import { queryJsonOrText } from '../json-query';
import { fullJobsFromJson, jobListAltFromJson, jobListFromJson, nodesFromJson, queuesFromJson } from './json';

const jobStatus: Record<string, string> = {
  B: 'Begun',
  E: 'Exiting',
  X: 'Expired',
  F: 'Finished',
  H: 'Held',
  M: 'Moved',
  Q: 'Queued',
  R: 'Running',
  S: 'Suspended',
  U: 'UserSuspended',
  T: 'Moving',
  W: 'Waiting',
};

const cmdDict: Record<string, string[]> = {
  alter:    ['qalter'],
  queue:    ['qstat', '-Q'],
  queues:   ['qstat', '-Q'],
  job:      ['qstat', '-x', '-f'],
  jobs:     ['qstat', '-x', '-w'],
  jobsAlt:  ['qstat', '-x', '-w', '-s', '-1'],
  node:     ['pbsnodes'],
  nodes:    ['pbsnodes', '-a'],
  move:     ['qmove'],
  submit:   ['qsub'],
  setting:  ['qmgr', '-c'],
  settings: ['qmgr', '-c', "'p s'"],
};

const nodeControlCmd: Record<string, string[]> = {
  clear:   ['-c'],
  offline: ['-o'],
  reset:   ['-r'],
};

const qActions: Record<string, string> = {
  qrun:   'forced to run',
  qrerun: 'successfully requeued',
  qdel:   'successfully cancelled',
  qhold:  'successfully put on hold',
  qrls:   'successfully released',
};

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

interface PbsNode {
  name: string;
  jobs?: Array<{ jobId: string; jobProcs: string[] }>;
  [key: string]: any;
}

function jsonifyPBSnodes(output: string[]): PbsNode {
  const results: any = {};
  results.name = output[0];

  for (let i = 1; i < output.length; i++) {
    if (output[i].indexOf('=') !== -1) {
      const data = output[i].split('=');
      results[data.shift()!.trim()] = data.join('=').trim();
    }
  }

  return parseNodeJobs(results);
}

/** "1.srv/0, 1.srv/1" → [{ jobId, jobProcs }] (shared by the text and JSON paths). */
function parseNodeJobs(results: any): PbsNode {
  if (results.jobs) {
    const runningJobs: Record<string, { jobId: string; jobProcs: string[] }> = {};
    const jobData = results.jobs.trim().split(/,/);

    for (const jd of jobData) {
      const jobProcess = jd.trim().split(/\//);
      const jobId = jobProcess[0];
      if (runningJobs[jobId]) {
        runningJobs[jobId].jobProcs.push(jobProcess[1]);
      } else {
        runningJobs[jobId] = { jobId, jobProcs: [jobProcess[1]] };
      }
    }

    results.jobs = Object.values(runningJobs);
  }

  return results;
}

function jsonifyQstat(output: string[]) {
  return {
    jobId:  output[0],
    name:   output[1],
    user:   output[2],
    time:   output[3],
    status: jobStatus[output[4]] || output[4],
    queue:  output[5],
  };
}

function jsonifyQstatAlt(output: string[]) {
  return {
    jobId:      output[0],
    user:       output[1],
    queue:      output[2],
    name:       output[3],
    sessionID:  output[4],
    NDS:        output[5],
    TSK:        output[6],
    req_memory: output[7],
    req_time:   output[8],
    status:     output[9],
    time:       output[10],
    comment:    output[11],
  };
}

function jsonifyQueues(output: string[]) {
  return {
    name:      output[0],
    maxJobs:   output[1],
    totalJobs: output[2],
    enabled:   output[3] === 'yes',
    started:   output[4] === 'yes',
    queued:    output[5],
    running:   output[6],
    held:      output[7],
    waiting:   output[8],
    moving:    output[9],
    exiting:   output[10],
    type:      /^R/.test(output[11] ?? '') ? 'Routing' : 'Execution', // column shows E/R (or Exec/Rout)
    completed: output[12],
  };
}

function jsonifyQstatFull(output: string, config: HpcConfig) {
  // Join truncated lines and split
  const lines = output.trim().replace(/\n\t/g, '').split(os.EOL);
  const results: any = {};

  // First line is Job Id
  results.jobId = lines[0].split(':')[1]?.trim();

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].indexOf(' = ') !== -1) {
      const data = lines[i].split(' = ');
      results[data[0].trim()] = data[1]?.trim();
    }
  }

  return finishQstatFull(results, config);
}

/** Status names and shared paths (shared by the text and JSON paths). */
function finishQstatFull(results: any, config: HpcConfig) {
  // Expand job status
  results.job_state = jobStatus[results.job_state] || results.job_state;

  // Parse Variable_List into sub-object (JSON already gives one)
  if (typeof results.Variable_List === 'string') {
    const variables = results.Variable_List.trim().split(/[,]+/);
    results.Variable_List = {};
    for (const v of variables) {
      const parts = v.split('=');
      results.Variable_List[parts[0]] = parts[1];
    }
  }

  // Transform paths to shared/mounted paths
  if (config.useSharedDir) {
    results.sharedPath = {};
    if (results.Variable_List?.PBS_O_WORKDIR) {
      results.sharedPath.workdir = getMountedPath(config, results.Variable_List.PBS_O_WORKDIR);
    }
    for (const _path of ['Error_Path', 'Output_Path']) {
      if (results[_path]) {
        if (results[_path].indexOf(':') > -1) {
          results[_path] = results[_path].split(':')[1];
        }
        results.sharedPath[_path] = getMountedPath(config, results[_path]);
      }
    }
  }

  return results;
}

function jsonifyQmgr(output: string[]) {
  const results: any = { queues: [], server: {} };
  const queueMap: Record<string, any> = {};

  for (const line of output) {
    if (line.indexOf('=') !== -1) {
      const data = line.split('=');
      const keys = data[0].trim().split(' ');
      const value = data[1].trim();

      switch (keys[1]?.trim()) {
        case 'server':
          results.server[keys[2].trim()] = value;
          break;
        case 'queue':
          if (!queueMap[keys[2].trim()]) queueMap[keys[2].trim()] = {};
          queueMap[keys[2].trim()][keys[3].trim()] = value;
          break;
      }
    }
  }

  for (const name in queueMap) {
    queueMap[name].name = name;
    results.queues.push(queueMap[name]);
  }

  return results;
}

// --- Resource parsing ---

export interface PbsResource {
  chunk?: number | string;
  ncpus?: number | string;
  mpiprocs?: number | string;
  mem?: string;
  host?: string;
  arch?: string;
  [key: string]: any;
}

function parseResources(resources: PbsResource | PbsResource[]): string {
  let select = '-l select=';
  const list: PbsResource[] = Array.isArray(resources) ? resources : [resources];

  for (let i = 0; i < list.length; i++) {
    if (i > 0) select += '+';
    select += list[i].chunk !== undefined && list[i].chunk !== ''
      ? String(list[i].chunk)
      : '1';

    for (const res in list[i]) {
      if (res !== 'chunk' && list[i][res] !== undefined && list[i][res] !== '') {
        select += `:${res}=${list[i][res]}`;
      }
    }
  }
  return select;
}

// --- Main API functions ---

/** Get the working directory for a job */
export async function getJobWorkDir(config: HpcConfig, jobId: string): Promise<string> {
  const data = await qstat(config, jobId);
  const workDir = data?.Variable_List?.PBS_O_WORKDIR;
  if (!workDir) throw new Error('Working directory not found');

  return config.useSharedDir
    ? getMountedPath(config, path.resolve(workDir))!
    : path.resolve(workDir);
}

/** List or query PBS nodes */
export async function qnodes(
  config: HpcConfig,
  nodeName?: string,
  controlCmd?: string
): Promise<any> {
  if (controlCmd && nodeName) {
    const remote_cmd = [...cmdBuilder(config.binariesDir, cmdDict.node), ...nodeControlCmd[controlCmd], nodeName];
    const output = spawnProcess(remote_cmd, 'shell', null, config);
    if (output !== true && output.stderr) {
      throw new Error(output.stderr);
    }
    return { message: `Node ${nodeName} put in ${controlCmd} state.` };
  }

  const [bin, ...args] = nodeName ? cmdDict.node : cmdDict.nodes;
  const res = queryJsonOrText(
    config, bin,
    nodeName ? ['-F', 'json', '-v', nodeName] : ['-a', '-F', 'json'],
    nodeName ? [...args, nodeName] : args
  );
  return 'json' in res ? nodesFromJson(res.json).map(parseNodeJobs) : parseNodesText(res.text);
}

function parseNodesText(text: string): PbsNode[] {
  const stdout = text
    .replace(/=,/g, '=null,')
    .split(os.EOL + os.EOL);

  const nodes: PbsNode[] = [];
  for (const chunk of stdout) {
    if (chunk.length > 1) {
      const lines = chunk.trim().split(/[\n;]+/);
      nodes.push(jsonifyPBSnodes(lines));
    }
  }
  return nodes;
}

/** List PBS queues */
export async function qqueues(config: HpcConfig, queueName?: string): Promise<any[]> {
  const [bin, ...args] = queueName ? cmdDict.queue : cmdDict.queues;
  const target = queueName ? [queueName] : [];
  const res = queryJsonOrText(config, bin, ['-Q', '-f', '-F', 'json', ...target], [...args, ...target]);
  if ('json' in res) return queuesFromJson(res.json);

  const lines = res.text.split(os.EOL);
  const queues: any[] = [];
  // First 2 lines are headers
  for (let j = 2; j < lines.length - 1; j++) {
    const parts = lines[j].trim().split(/[\s]+/);
    queues.push(jsonifyQueues(parts));
  }
  return queues;
}

/** Query job status - list all or specific job */
export async function qstat(config: HpcConfig, jobId?: string): Promise<any> {
  let textCmd: string[];
  let jobList = true;
  // Call by short job# to avoid errors
  const shortId = jobId && jobId !== 'all' ? jobId.split('.')[0] : null;

  if (jobId) {
    textCmd = [...cmdDict.job];
    if (shortId) {
      textCmd.push(shortId);
      jobList = false;
    }
  } else {
    textCmd = config.useAlternate ? [...cmdDict.jobsAlt] : [...cmdDict.jobs];
  }

  // JSON: one full listing (`qstat -x -f -F json [id]`) serves every shape below.
  const [bin, ...textArgs] = textCmd;
  const res = queryJsonOrText(config, bin, ['-x', '-f', '-F', 'json', ...(shortId ? [shortId] : [])], textArgs);
  if ('json' in res) {
    if (shortId) {
      const [job] = fullJobsFromJson(res.json);
      if (!job) throw new Error(`qstat: Unknown Job Id ${jobId}`);
      return finishQstatFull(job, config);
    }
    if (jobId === 'all') return fullJobsFromJson(res.json).map((j) => finishQstatFull(j, config));
    return config.useAlternate ? jobListAltFromJson(res.json) : jobListFromJson(res.json, jobStatus);
  }

  const stdout = res.text;
  if (!stdout || stdout.length === 0) return [];

  if (jobList) {
    const jobs: any[] = [];
    if (jobId === 'all') {
      const chunks = stdout.trim().split(os.EOL + os.EOL);
      for (const chunk of chunks) {
        jobs.push(jsonifyQstatFull(chunk, config));
      }
    } else {
      const lines = stdout.split(os.EOL);
      if (config.useAlternate) {
        for (let j = 5; j < lines.length - 1; j++) {
          const line = lines[j]
            .replace(/^.*?\s/, (m) => m + '  ')
            .replace(/\s[A-Z]\s/, (s) => '  ' + s + '  ');
          const parts = line.trim().split(/[\s]{2,}/);
          jobs.push(jsonifyQstatAlt(parts));
        }
      } else {
        for (let k = 2; k < lines.length - 1; k++) {
          const parts = lines[k].trim().split(/[\s]+/);
          jobs.push(jsonifyQstat(parts));
        }
      }
    }
    return jobs;
  }

  return jsonifyQstatFull(stdout, config);
}

/** Move a job to a different queue */
export async function qmove(
  config: HpcConfig,
  jobId: string,
  destination: string
): Promise<{ message: string }> {
  const remote_cmd = cmdBuilder(config.binariesDir, cmdDict.move);
  remote_cmd.push(destination);
  remote_cmd.push(jobId);

  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr);
  }
  return { message: `Job ${jobId} successfully moved to queue ${destination}` };
}

/** Query PBS manager settings */
export async function qmgr(config: HpcConfig): Promise<any> {
  const remote_cmd = cmdBuilder(config.binariesDir, cmdDict.settings);
  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr);
  }

  const lines = (output as SpawnResult).stdout.split(os.EOL);
  return jsonifyQmgr(lines);
}

/** Alter job parameters */
export async function qalter(
  config: HpcConfig,
  jobId: string,
  jobSettings: { jobName?: string; priority?: number }
): Promise<string> {
  const remote_cmd = cmdBuilder(config.binariesDir, cmdDict.alter);

  if (jobSettings.jobName) {
    remote_cmd.push('-N', jobSettings.jobName);
  }
  if (jobSettings.priority !== undefined) {
    const priority = Math.max(Math.min(Number(jobSettings.priority), 1023), -1024);
    remote_cmd.push('-p', String(priority));
  }
  remote_cmd.push(jobId);

  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr);
  }
  return `Job ${jobId} successfully altered`;
}

/** Generate a PBS submission script */
export interface PbsJobArgs {
  shell?: string;
  jobName: string;
  resources: PbsResource | PbsResource[];
  custom?: Record<string, any>;
  walltime?: string;
  workdir?: string;
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

export async function qscript(
  jobArgs: PbsJobArgs,
  localPath: string
): Promise<{ message: string; path: string }> {
  const PBScommand = '#PBS ';
  let toWrite = '# Autogenerated script';

  if (jobArgs.jobName.search(/[^a-zA-Z0-9]/g) !== -1) {
    throw new Error('Name cannot contain special characters');
  }

  const scriptFullPath = path.join(localPath, jobArgs.jobName);

  // Shell
  toWrite += os.EOL + PBScommand + '-S ' + (jobArgs.shell || '/bin/bash');
  // Name
  toWrite += os.EOL + PBScommand + '-N ' + jobArgs.jobName;

  if (jobArgs.stdout) toWrite += os.EOL + PBScommand + '-o ' + jobArgs.stdout;
  if (jobArgs.stderr) toWrite += os.EOL + PBScommand + '-e ' + jobArgs.stderr;

  // Resources
  toWrite += os.EOL + PBScommand + parseResources(jobArgs.resources);

  // Custom resources
  if (jobArgs.custom) {
    for (const key in jobArgs.custom) {
      toWrite += os.EOL + PBScommand + '-l ' + key + '=' + jobArgs.custom[key];
    }
  }

  if (jobArgs.walltime) {
    toWrite += os.EOL + PBScommand + '-l ' + jobArgs.walltime;
  }
  if (jobArgs.queue) {
    toWrite += os.EOL + PBScommand + '-q ' + jobArgs.queue;
  }
  if (jobArgs.exclusive) {
    toWrite += os.EOL + PBScommand + '-n';
  }

  // Environment variables
  if (jobArgs.env) {
    for (const key in jobArgs.env) {
      toWrite += os.EOL + PBScommand + '-v "' + key + '=' + jobArgs.env[key] + '", ';
    }
  }

  // Mail notifications
  if (jobArgs.mail) {
    toWrite += os.EOL + PBScommand + '-M ' + jobArgs.mail;
    let mailArgs = '';
    if (jobArgs.mailAbort) mailArgs = '-m a';
    if (jobArgs.mailBegins) mailArgs = mailArgs ? mailArgs + 'b' : '-m b';
    if (jobArgs.mailTerminates) mailArgs = mailArgs ? mailArgs + 'e' : '-m e';
    if (mailArgs) toWrite += os.EOL + PBScommand + mailArgs;
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

/** Submit a job */
export async function qsub(
  config: HpcConfig,
  qsubArgs: string[],
  jobWorkingDir: string
): Promise<{ message: string; jobId: string; path: string }> {
  if (qsubArgs.length < 1) {
    throw new Error('Please submit the script to run');
  }

  const mountedPath = getMountedPath(config, jobWorkingDir);

  // Copy files to working directory
  for (const file of qsubArgs) {
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
  const scriptName = path.basename(qsubArgs[0]);
  let remote_cmd = cmdBuilder(config.binariesDir, cmdDict.submit);
  remote_cmd.push(scriptName);
  remote_cmd = ['cd', jobWorkingDir, '&&', ...remote_cmd];

  const output = spawnProcess(remote_cmd, 'shell', null, config);
  if (output !== true && output.stderr) {
    throw new Error(output.stderr.replace(/\n/g, ''));
  }

  const jobId = (output as SpawnResult).stdout.replace(/\n/g, '');
  return {
    message: `Job ${jobId} submitted`,
    jobId,
    path: jobWorkingDir,
  };
}

/** Find files in a job's working directory */
export async function qfind(config: HpcConfig, jobId: string): Promise<{ files: string[]; folders: string[] }> {
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
export async function qretrieve(
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

async function qFn(
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

export async function qdel(config: HpcConfig, jobId: string) {
  return qFn('qdel', qActions.qdel, config, jobId);
}

export async function qhold(config: HpcConfig, jobId: string) {
  return qFn('qhold', qActions.qhold, config, jobId);
}

export async function qrls(config: HpcConfig, jobId: string) {
  return qFn('qrls', qActions.qrls, config, jobId);
}

export async function qrun(config: HpcConfig, jobId: string) {
  return qFn('qrun', qActions.qrun, config, jobId);
}

export async function qrerun(config: HpcConfig, jobId: string) {
  return qFn('qrerun', qActions.qrerun, config, jobId);
}
