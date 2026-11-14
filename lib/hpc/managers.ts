/**
 * HPC Manager Abstraction Layer
 * Provides a unified interface for PBS and SLURM scheduler operations.
 * Ported from libs/managers.js (PBS + SLURM only, no WinHPC/Torque)
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import * as pbs from './pbs';
import * as slurm from './slurm';
import { hpcFormatter, type NodeListResult } from './formatter';
import * as jobMethods from '@/lib/db/jobs';
import * as alertMethods from '@/lib/alerts';
import { getConfig } from '@/lib/config';
import { tryLoadJson } from '@/lib/config/cache';
import type { HpcConfig } from './exec';
import { asUser, type FsUser } from '@/lib/files/as-user';
import { getUploadFolder } from '@/lib/files/datajs';
import { applyTemplate } from './job-template';
import { checkJobArgs, positiveInt, slurmResources } from './slurm/options';
import { log } from '@/lib/log';
import { wrap, type Result } from './result';
import type { NodeListResult as _NodeListResult } from './formatter';

export type ManagerType = 'pbs' | 'slurm';

// Command dictionary mapping manager operations to scheduler-specific functions
const cmdDict: Record<ManagerType, Record<string, string>> = {
  pbs: {
    nodes: 'qnodes', queues: 'qqueues', getWorkDir: 'getJobWorkDir',
    setWorkDir: 'createJobWorkDir', detWorkDir: 'getMountedPath',
    job: 'qstat', jobs: 'qstat', move: 'qmove', files: 'qfind',
    cancel: 'qdel', retrieve: 'qretrieve', script: 'qscript',
    alter: 'qalter', submit: 'qsub', run: 'qrun', rerun: 'qrerun',
    hold: 'qhold', release: 'qrls',
  },
  slurm: {
    nodes: 'snodes', queues: 'spartitions', getWorkDir: 'getJobWorkDir',
    setWorkDir: 'createJobWorkDir', detWorkDir: 'getMountedPath',
    job: 'scontrolJob', jobs: 'squeue', move: 'smove', files: 'sfind',
    cancel: 'scancel', retrieve: 'sretrieve', script: 'sscript',
    alter: 'salter', submit: 'sbatch', rerun: 'srequeue',
    hold: 'shold', release: 'srelease',
  },
};

const managerApi: Record<ManagerType, any> = { pbs, slurm };

const jobActions = ['cancel', 'run', 'rerun', 'hold', 'release'];

// ---- Helper functions ----

function camelize(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/[\s]+(\w|$)/g, (_, x) => x.toUpperCase());
}

// Written as the user: paths here can be user-controlled (inputFileName, job dirs).
function writeFileOwn(file: string, data: string, user: FsUser): void {
  asUser(user, 'write', file, data);
}

// ---- Job operations ----

/** List all jobs on the cluster */
export async function jobList(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig
): Promise<any[]> {
  const api = managerApi[manager];
  const cmd = cmdDict[manager].jobs;
  const data = await api[cmd](hpcConfig, 'all');
  const formatted = hpcFormatter(manager, 'job', data);

  // Background: compare with DB to update statuses
  compareJobInfo(user, manager, hpcConfig, formatted).catch((err) => log.error({ err }, "compareJobInfo failed"));

  return formatted;
}

/** Get info on a specific job */
export async function jobInfo(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string
): Promise<any> {
  const api = managerApi[manager];
  const cmd = cmdDict[manager].job;
  const data = await api[cmd](hpcConfig, jobId);
  return hpcFormatter(manager, 'job', data);
}

/** Delete/cancel a job */
export async function jobDelete(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string
): Promise<any> {
  const api = managerApi[manager];
  const cmd = cmdDict[manager].cancel;
  return api[cmd](hpcConfig, jobId);
}

/** Move a job to a different queue */
export async function jobMove(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string,
  destination: string
): Promise<any> {
  const cmd = cmdDict[manager].move;
  if (!cmd) throw new Error('Move not supported for this manager');
  return managerApi[manager][cmd](hpcConfig, jobId, destination);
}

/** Perform a job action (cancel, run, rerun, hold, release) */
export async function jobAction(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string,
  action: string
): Promise<any> {
  if (!jobActions.includes(action)) throw new Error('Action not implemented.');
  const cmd = cmdDict[manager][action];
  if (!cmd) throw new Error(`Action '${action}' not supported for ${manager}`);
  return managerApi[manager][cmd](hpcConfig, jobId);
}

/** Retrieve job files to a local directory */
export async function jobRetrieve(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string,
  jobFiles: string | string[],
  destination: string
): Promise<any> {
  const files = Array.isArray(jobFiles) ? jobFiles : [jobFiles];
  const cmd = cmdDict[manager].retrieve;
  return managerApi[manager][cmd](hpcConfig, jobId, files, destination);
}

/** List files in a job's working directory (returns jstree-compatible structure) */
export async function jobFiles(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string
): Promise<any[]> {
  const cmd = cmdDict[manager].files;
  const data = await managerApi[manager][cmd](hpcConfig, jobId);
  return transformFiles(data, hpcConfig);
}

function transformFiles(data: { files: string[]; folders: string[] }, hpcConfig: HpcConfig): any[] {
  const result: any[] = [];

  // Root
  const rootDir = data.folders.shift()!;
  result.push({
    id: rootDir,
    parent: '#',
    text: path.basename(rootDir),
    state: { opened: true, disabled: false, selected: false },
    li_attr: { base: rootDir, isLeaf: false, class: 'folder' },
  });

  for (const folder of data.folders) {
    result.push({
      id: folder,
      parent: path.dirname(folder),
      text: path.basename(folder),
      icon: 'jstree-folder',
      state: { opened: true, disabled: false, selected: false },
      li_attr: { base: folder, isLeaf: false, class: 'folder' },
    });
  }

  for (const file of data.files) {
    result.push({
      id: file,
      parent: path.dirname(file),
      text: path.basename(file),
      icon: 'jstree-file',
      li_attr: { base: file, isLeaf: true, class: 'file colored' },
    });
  }

  return result;
}

// ---- Alter jobs ----

export async function alterJob(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string,
  jobArgs: { jobName?: string; priority?: number | string }
): Promise<any> {
  if (jobArgs.jobName) jobArgs.jobName = camelize(jobArgs.jobName);
  if (jobArgs.priority) jobArgs.priority = Number(jobArgs.priority);
  const cmd = cmdDict[manager].alter;
  if (!cmd) throw new Error('Alter not supported for this manager');
  return managerApi[manager][cmd](hpcConfig, jobId, jobArgs);
}

// ---- Submit jobs ----

export async function submitJob(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobArgs: any
): Promise<any> {
  const config = getConfig();
  const tmpDir = path.normalize(config.mainConfig.tmpdir || '/tmp');

  // Load app form
  const { getAppForm, getAppList } = await import('@/lib/apps');
  const appForm = await getAppForm(jobArgs.appDomain, jobArgs.appName);
  // App metadata (parser, terminal…) lives in applist.json, not in the form template.
  const appDetails = getAppList().appList?.[jobArgs.appDomain]?.[jobArgs.appName];
  if (!appDetails) throw new Error(`Unknown application ${jobArgs.appDomain}/${jobArgs.appName}`);

  // Defaults, checkbox values, binary and command line come from the template, not the client.
  applyTemplate(appForm, jobArgs);

  // Convert the name
  jobArgs.jobName = camelize(jobArgs.jobName);
  jobArgs.useoutputFile = true;

  if (appDetails.terminal) jobArgs.terminal = true;
  jobArgs.inputFileSource = jobArgs.inputFileSource?.toLowerCase() || '';

  // Parse form fields for files, env vars, licenses
  const jobFiles: string[] = [];

  if (jobArgs.useinputFile) {
    jobArgs.inputFile = jobArgs['inputFile[]'];
    delete jobArgs['inputFile[]'];
  }

  // Create local job directory
  const localJobDir = await mkLocalJobDir(user, jobArgs);
  const homeJobDir = path.resolve(localJobDir);

  // Create temp directory
  const tmpJobDir = path.join(tmpDir, user._id.toString(), path.basename(localJobDir));
  try {
    fs.mkdirSync(tmpJobDir, { recursive: true });
    if (process.platform !== 'win32') {
      fs.chownSync(tmpJobDir, user.system.uid, user.system.gid);
      fs.chmodSync(tmpJobDir, '0700');
    }
  } catch { /* ignore */ }

  // Handle input file
  if (jobArgs.useinputFile) {
    if (jobArgs.inputFileSource === 'write') {
      jobArgs.inputFile = path.join(tmpJobDir, jobArgs.inputFileName);
      jobArgs.scriptCommands = jobArgs.scriptCommands?.replace(/(?:\r\n|\r|\n)/g, os.EOL) || '';
      writeFileOwn(jobArgs.inputFile, jobArgs.scriptCommands, user.system);
    }
    jobFiles.push(jobArgs.inputFile);
  }

  // Parse env, licenses, additional files
  jobArgs.env = {};
  jobArgs.licenses = {};

  for (const field in jobArgs) {
    if (typeof jobArgs[field] === 'boolean' && jobArgs[field] && field !== 'useoutputFile' && field !== 'useinputFile') {
      const m = field.match(/use(.+)/);
      if (m) {
        const fieldId = m[1];
        const filePath = fieldId + 'Path[]';
        if (jobArgs[filePath]) {
          jobArgs[fieldId] = [];
          let files = jobArgs[filePath];
          if (!Array.isArray(files)) files = [files];
          for (const f of files) {
            jobFiles.push(f);
            jobArgs[fieldId].push(path.basename(f));
          }
          delete jobArgs[filePath];
        }
      }
    } else {
      const n = field.match(/env\[(.+?)\]/);
      if (n) {
        jobArgs.env[n[1]] = jobArgs[field];
        delete jobArgs[field];
      } else {
        const o = field.match(/licenses\[(.+?)\]/);
        if (o) {
          if (Number(jobArgs[field]) > 0) {
            jobArgs.licenses[o[1]] = Number(jobArgs[field]);
          }
          delete jobArgs[field];
        }
      }
    }
  }

  // Build script commands
  jobArgs.commands = [];
  buildScriptCmds(user, manager, hpcConfig, jobArgs, jobFiles);

  // Create working directory
  const { jobWorkingDir, mountedWorkingDir } = await determineWorkdir(
    manager, hpcConfig, jobArgs.runLocally, jobArgs.jobName, localJobDir
  );

  jobArgs.workdir = jobWorkingDir;

  // Generate script
  const scriptCmd = cmdDict[manager].script;
  const scriptInfo = await managerApi[manager][scriptCmd](jobArgs, tmpJobDir);

  // Take ownership. lchown: tmpJobDir is user-owned, so never follow a planted symlink.
  if (process.platform !== 'win32') {
    fs.lchownSync(scriptInfo.path, user.system.uid, user.system.gid);
  }

  const localJobFiles = [scriptInfo.path, ...jobFiles];

  // Move/backup files
  const { transferredFiles, savedLocations } = moveJobFiles(
    user, hpcConfig, localJobFiles, homeJobDir, tmpJobDir, mountedWorkingDir || jobWorkingDir, true
  );

  // Submit
  const submitCmd = cmdDict[manager].submit;
  const submitInfo = await managerApi[manager][submitCmd](hpcConfig, transferredFiles, jobWorkingDir);

  // Save job info to DB
  const savedJobInfo: any = {
    jobId: submitInfo.jobId,
    jobDate: new Date(),
    userId: user._id.toString(),
    username: user.username,
    jobName: jobArgs.jobName,
    localJobDir: path.normalize(localJobDir + path.sep),
    localJobFiles: savedLocations,
    jobArgs,
    output: {},
  };

  // Apply forced fields from app form
  if (appForm.force) {
    const normPatternExt = /(VAR\.([a-zA-Z]+)\[.([a-zA-Z]+)])/g;
    for (const forceField in appForm.force) {
      jobArgs[forceField] = appForm.force[forceField].replace(
        normPatternExt,
        (...args: any[]) => {
          if (jobArgs[args[2]]) {
            if (args[3]) {
              const pos = jobArgs[args[2]].lastIndexOf('.');
              return jobArgs[args[2]].substr(0, pos < 0 ? jobArgs[args[2]].length : pos) + '.' + args[3];
            }
            return jobArgs[args[2]];
          }
          return '';
        }
      );
    }
  }

  // Determine output location
  const workDir = mountedWorkingDir || jobWorkingDir;
  savedJobInfo.mountedWorkingDir = path.normalize(workDir + path.sep);

  if (jobArgs.useoutputFile) {
    savedJobInfo.output.outputFile = path.join(workDir, jobArgs.outputFile);
  }

  // Track parser files
  if (appDetails.parser?.post) {
    for (const file of appDetails.parser.post) {
      try {
        savedJobInfo.output[file] = path.join(workDir, jobArgs[file]);
      } catch { /* ignore */ }
    }
    if (jobArgs.useinputFile && appDetails.parser.pre) {
      savedJobInfo.output.inputFile = jobArgs.inputFile;
    }
  } else {
    savedJobInfo.no_parsing = true;
  }

  // Remote job connection file
  if (jobArgs.type === 'remote') {
    jobArgs.connectionFile = path.join(workDir, jobArgs.connectionFile);
    jobArgs.connectionReady = false;
  }

  await jobMethods.saveJobInfo(submitInfo.jobId, savedJobInfo);

  // Non-blocking alert
  alertMethods.saveAlert(user._id, 'success', `Job ${submitInfo.jobId} successfully submitted to the server!`).catch((err) => log.error({ err }, "saveAlert failed"));

  return {
    ...submitInfo,
    type: jobArgs.type,
    runLocally: jobArgs.runLocally,
    inputFileSource: jobArgs.inputFileSource,
    mountedWorkingDir: savedJobInfo.mountedWorkingDir,
    workdir: path.basename(jobArgs.workdir),
  };
}

// ---- Internal helpers ----

async function mkLocalJobDir(user: any, jobArgs: any, suffix = 0): Promise<string> {
  const localJobsDir = path.join(user.system.home, 'jobs');

  if (jobArgs.useinputFile && jobArgs.runLocally) {
    return jobArgs.reuse ? path.resolve(jobArgs.reuseFolder) : path.dirname(jobArgs.inputFile);
  }

  const dirName = jobArgs.jobName + (suffix > 0 ? '-' + suffix : '');
  const fullPath = path.join(localJobsDir, dirName);

  try {
    asUser(user.system, 'mkdir', localJobsDir, true); // first job: ~/jobs may not exist yet
    asUser(user.system, 'mkdir', fullPath);
    return fullPath;
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      return mkLocalJobDir(user, jobArgs, suffix + 1);
    }
    throw err;
  }
}

async function determineWorkdir(
  manager: ManagerType,
  hpcConfig: HpcConfig,
  runLocally: boolean,
  jobName: string,
  localJobDir: string
): Promise<{ jobWorkingDir: string; mountedWorkingDir: string | null }> {
  if (runLocally) {
    if (hpcConfig.method === 'local') {
      return { jobWorkingDir: localJobDir, mountedWorkingDir: localJobDir };
    }
    if (localJobDir.indexOf(hpcConfig.sharedDir) > -1) {
      const subDir = path.relative(hpcConfig.sharedDir, localJobDir);
      const remotePath = path.join(hpcConfig.workingDir, subDir);
      return { jobWorkingDir: remotePath, mountedWorkingDir: localJobDir };
    }
    throw new Error('Path is not available on the remote server.');
  }

  const api = managerApi[manager];
  return api.createJobWorkDir(hpcConfig, jobName);
}

function buildScriptCmds(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobArgs: any,
  jobFiles: string[]
): void {
  checkJobArgs(jobArgs);

  // Parse walltime
  if (
    (jobArgs.walltimeHours && Number(jobArgs.walltimeHours) > 0) ||
    (jobArgs.walltimeMinutes && Number(jobArgs.walltimeMinutes) > 0)
  ) {
    jobArgs.walltimeHours = Number(jobArgs.walltimeHours) || 0;
    jobArgs.walltimeMinutes = Number(jobArgs.walltimeMinutes) || 0;
  } else {
    delete jobArgs.walltimeMinutes;
    delete jobArgs.walltimeHours;
    delete jobArgs.walltime;
  }

  jobArgs.resources = [];

  switch (manager) {
    case 'pbs': {
      if (jobArgs.jobPlacement === 'nodes') {
        delete jobArgs.queue;
        // Primary node first
        if (jobArgs.primaryNode?.length > 1) {
          const el = `manualNodes[${jobArgs.primaryNode}]`;
          const ncpus = Number(jobArgs[el]);
          if (ncpus > 0) {
            jobArgs.resources.push({ host: jobArgs.primaryNode, ncpus, mpiprocs: ncpus });
          }
          delete jobArgs[el];
        }
        for (const field in jobArgs) {
          const p = field.match(/manualNodes\[(.+?)\]/);
          if (p) {
            const ncpus = Number(jobArgs[field]);
            if (ncpus > 0) {
              jobArgs.resources.push({ host: p[1], ncpus, mpiprocs: ncpus });
            }
            delete jobArgs[field];
          }
        }
      } else {
        let jobRes: any;
        if (jobArgs.hybridMPI && jobArgs.numThreads) {
          jobRes = { chunk: jobArgs.numProcs, ncpus: jobArgs.numThreads, mpiprocs: 1 };
        } else {
          jobRes = { chunk: jobArgs.numProcs };
        }
        if (jobArgs.mem) jobRes.mem = positiveInt('Memory', jobArgs.mem) + 'gb';
        jobArgs.resources = jobRes;
      }
      break;
    }
    case 'slurm': {
      jobArgs.resources = slurmResources(jobArgs);
      jobArgs.stdout = jobArgs.outputFile;
      jobArgs.stderr = jobArgs.outputFile;
      break;
    }
  }

  // Script commands
  jobArgs.commands.push(`JOBNAME='${jobArgs.jobName}'`);
  jobArgs.commands.push(jobArgs.prologueCommands || '');

  switch (jobArgs.type) {
    case 'batch':
      jobArgs.commands.push(jobArgs.preCommands || '');
      jobArgs.commands.push(jobArgs.mainCommand || '');
      jobArgs.commands.push(jobArgs.postCommands || '');
      break;
    case 'remote': {
      const appsFolder = path.join(process.cwd(), 'apps');
      const remoteScriptFolder = path.join(appsFolder, 'templates', 'remote');
      const remotelist =
        tryLoadJson<Record<string, any>>(path.join(appsFolder, 'remotelist.json')) ?? {};

      const remoteType = hpcConfig.remote || 'turbovnc';
      const remoteConfig = remotelist[remoteType] || {};

      jobArgs.connectionFile = jobArgs.jobName + '.' + (remoteConfig.ext || 'vnc');

      const starterCmds: string[] = [];
      const cleanerCmds: string[] = [];
      const starterScript = `launcher_${jobArgs.jobName}.sh`;
      const cleanerScript = `cleaner_${jobArgs.jobName}.sh`;
      const starterScriptPath = path.join(getConfig().mainConfig.tmpdir || '/tmp', starterScript);
      const cleanerScriptPath = path.join(getConfig().mainConfig.tmpdir || '/tmp', cleanerScript);

      if (hpcConfig.remote_security) {
        starterCmds.push(`VNCSECURITY='${hpcConfig.remote_security}'`);
      }
      if (hpcConfig.remote_domain) {
        let localDomain: string, remoteDomain: string;
        if (hpcConfig.remote_domain.indexOf('=') > -1) {
          const parts = hpcConfig.remote_domain.split('=');
          localDomain = parts[0];
          remoteDomain = parts[1];
        } else {
          localDomain = '$';
          remoteDomain = hpcConfig.remote_domain;
        }
        starterCmds.push(`REMOTE_DOMAIN='s/${localDomain.replace(/\./g, '\\.')}/${remoteDomain}/'`);
      }

      // Load hostname script
      try {
        starterCmds.push(...fs.readFileSync(path.join(remoteScriptFolder, 'utils', 'get_hostname.sh'), 'utf8').split(os.EOL));
      } catch { /* ignore */ }

      // Load start scripts
      const toArray = (v: any) => Array.isArray(v) ? v : [v].filter(Boolean);
      for (const startFile of toArray(remoteConfig.start)) {
        try {
          const f = startFile.endsWith('.sh') ? startFile : startFile + '.sh';
          starterCmds.push(...fs.readFileSync(path.join(remoteScriptFolder, f), 'utf8').split(os.EOL));
        } catch { /* ignore */ }
      }
      for (const connectFile of toArray(remoteConfig.connect)) {
        try {
          const f = connectFile.endsWith('.sh') ? connectFile : connectFile + '.sh';
          starterCmds.push(...fs.readFileSync(path.join(remoteScriptFolder, f), 'utf8').split(os.EOL));
        } catch { /* ignore */ }
      }
      for (const cleanFile of toArray(remoteConfig.clean)) {
        try {
          const f = cleanFile.endsWith('.sh') ? cleanFile : cleanFile + '.sh';
          cleanerCmds.push(...fs.readFileSync(path.join(remoteScriptFolder, f), 'utf8').split(os.EOL));
        } catch { /* ignore */ }
      }

      cleanerCmds.push(`rm -f ${starterScript}`);
      cleanerCmds.push(`rm -f ${cleanerScript}`);
      cleanerCmds.push(os.EOL);

      writeFileOwn(starterScriptPath, starterCmds.join(os.EOL), user.system);
      writeFileOwn(cleanerScriptPath, cleanerCmds.join(os.EOL), user.system);

      jobFiles.push(starterScriptPath);
      jobFiles.push(cleanerScriptPath);

      jobArgs.commands.push('cleanup() {');
      jobArgs.commands.push(`\tsource ./${cleanerScript} /dev/null 2>&1`);
      jobArgs.commands.push('}');
      jobArgs.commands.push('trap cleanup SIGINT SIGTERM SIGKILL EXIT');
      jobArgs.commands.push('');
      jobArgs.commands.push(`source ./${starterScript}`);
      jobArgs.commands.push('');
      jobArgs.commands.push(jobArgs.preCommands || '');
      jobArgs.commands.push('${WRAPPER}' + (jobArgs.mainCommand || ''));
      jobArgs.commands.push(jobArgs.postCommands || '');
      break;
    }
  }

  jobArgs.commands.push(jobArgs.epilogueCommands || '');
  jobArgs.commands = jobArgs.commands.join(os.EOL);

  // Licenses as custom resources
  if (jobArgs.licenses && Object.keys(jobArgs.licenses).length > 0) {
    jobArgs.custom = jobArgs.licenses;
  }

  // Walltime
  if (jobArgs.walltimeHours !== undefined || jobArgs.walltimeMinutes !== undefined) {
    const hms = `${jobArgs.walltimeHours || 0}:${String(jobArgs.walltimeMinutes || 0).padStart(2, '0')}:00`;
    // PBS takes `-l walltime=H:MM:SS`; sbatch takes `--time=H:MM:SS`.
    jobArgs.walltime = manager === 'slurm' ? hms : `walltime=${hms}`;
  }
}

function moveJobFiles(
  user: any,
  hpcConfig: HpcConfig,
  localJobFiles: string[],
  homeJobDir: string,
  tmpJobDir: string,
  mountedWorkingDir: string,
  backup: boolean
): { transferredFiles: string[]; savedLocations: any[] } {
  const transferredFiles: string[] = [];
  const savedLocations: any[] = [];
  const uploadFolder = getUploadFolder(user);

  for (const file of localJobFiles) {
    const normFile = path.normalize(file);
    const fileName = path.basename(normFile);

    const location: any = {
      path: path.join(mountedWorkingDir, fileName),
    };

    if (normFile.startsWith(tmpJobDir)) {
      // Script files already in temp
      transferredFiles.push(normFile);
      if (backup) {
        location.backup = path.join(homeJobDir, fileName);
        try {
          asUser(user.system, 'copy', normFile, path.join(homeJobDir, fileName));
        } catch { /* ignore */ }
      }
    } else if (normFile.startsWith(uploadFolder)) {
      // Uploaded files - move to tmpJobDir
      const dest = path.join(tmpJobDir, fileName);
      try {
        asUser(user.system, 'move', normFile, dest);
      } catch (err) {
        // Without this the job fails later with a bare "cp: cannot stat".
        throw new Error(`Cannot move the uploaded file ${fileName} into the job folder: ${(err as Error).message}`);
      }
      // Each job upload has its own folder (lib/files/upload.ts); drop it once empty.
      if (path.dirname(normFile) !== uploadFolder) {
        try { asUser(user.system, 'rm', path.dirname(normFile)); } catch { /* not empty */ }
      }
      transferredFiles.push(dest);
      if (backup) {
        location.backup = path.join(homeJobDir, fileName);
        try { asUser(user.system, 'copy', dest, path.join(homeJobDir, fileName)); } catch { /* ignore */ }
      }
    } else if (normFile.startsWith(user.system?.home || '')) {
      // From home - copy directly to working dir
      try {
        asUser(user.system, 'copy', normFile, path.join(mountedWorkingDir, fileName));
      } catch { /* ignore */ }
      transferredFiles.push(path.join(mountedWorkingDir, fileName));
      location.backup = normFile;
      location.localJobDir = path.dirname(normFile);
    } else {
      // From working folder or elsewhere - leave for scheduler to handle
      transferredFiles.push(normFile);
    }

    savedLocations.push(location);
  }

  return { transferredFiles, savedLocations };
}

// ---- Node operations ----

export async function nodeList(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig
): Promise<NodeListResult> {
  const api = managerApi[manager];
  const cmd = cmdDict[manager].nodes;
  const data = await api[cmd](hpcConfig);
  return hpcFormatter(manager, 'node', data) as NodeListResult;
}

export async function nodeInfo(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  nodeName: string
): Promise<any> {
  const api = managerApi[manager];
  const cmd = cmdDict[manager].nodes;
  const data = await api[cmd](hpcConfig, nodeName);
  return hpcFormatter(manager, 'node', data);
}

/** Result-wrapped variants — used by API routes so error context reaches the response. */
export async function jobListResult(
  user: any, manager: ManagerType, hpcConfig: HpcConfig
): Promise<Result<any[]>> {
  return wrap(() => jobList(user, manager, hpcConfig));
}

export async function nodeListResult(
  user: any, manager: ManagerType, hpcConfig: HpcConfig
): Promise<Result<_NodeListResult>> {
  return wrap(() => nodeList(user, manager, hpcConfig));
}

export async function nodeInfoResult(
  user: any, manager: ManagerType, hpcConfig: HpcConfig, nodeName: string
): Promise<Result<any>> {
  return wrap(() => nodeInfo(user, manager, hpcConfig, nodeName));
}

// ---- Queue operations ----

export async function queueList(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig
): Promise<any[]> {
  const api = managerApi[manager];
  const cmd = cmdDict[manager].queues;
  const data = await api[cmd](hpcConfig);
  return hpcFormatter(manager, 'queue', data);
}

// ---- Background job comparison ----

async function compareJobInfo(
  user: any,
  manager: ManagerType,
  hpcConfig: HpcConfig,
  serverResult: any[]
): Promise<void> {
  try {
    const dbResult = await jobMethods.getJobInfo(user._id.toString());
    const localDb: Record<string, any> = {};
    const jobQueue: Record<string, string> = {};

    // Newest first: an older record with a reused job id is archived, not matched.
    for (const job of dbResult) {
      if (job.server?.status !== 'Archive' && localDb[job.jobId]) {
        await jobMethods.saveRemoteInfo(user, job.jobId, { status: 'Archive' }, job);
      } else if (job.server?.status !== 'Archive') {
        localDb[job.jobId] = job;
        // Force update for remote jobs waiting for connection file
        if (
          job.jobInfo.jobArgs?.type === 'remote' &&
          !job.jobInfo.jobArgs?.connectionReady &&
          job.server?.status === 'Running'
        ) {
          job.server.status = 'Configuring';
        }
      }
    }

    for (const job of serverResult) {
      if (job.status) jobQueue[job.jobId] = job.status;
    }

    for (const jobId in localDb) {
      if (localDb[jobId].server.status !== jobQueue[jobId]) {
        if (!(jobId in jobQueue)) {
          // Job no longer in queue - archive it
          await jobMethods.saveRemoteInfo(user, jobId, { status: 'Archive' }, localDb[jobId]);
        } else {
          // Status changed - update
          await updateJobInfo(manager, hpcConfig, jobId, localDb[jobId]);
          await alertMethods.saveAlert(
            user._id,
            'info',
            `Job ${jobId} is now ${jobQueue[jobId]}`
          );
        }
      }
    }
  } catch (err) {
    log.error({ err }, "compareJobInfo error");
  }
}

async function updateJobInfo(
  manager: ManagerType,
  hpcConfig: HpcConfig,
  jobId: string,
  currentDbInfo: any
): Promise<void> {
  try {
    const api = managerApi[manager];
    const cmd = cmdDict[manager].job;
    const remoteJobInfo = await api[cmd](hpcConfig, jobId);
    const formatted = hpcFormatter(manager, 'job', remoteJobInfo);

    // Inject info for new/linked jobs
    if (!currentDbInfo.jobInfo.jobName) {
      currentDbInfo.jobInfo.jobName = formatted.name;
      currentDbInfo.jobInfo.jobArgs.mainCommand = formatted.Submit_arguments;
      currentDbInfo.jobInfo.jobDate = new Date(formatted.creationtime);
    }

    await jobMethods.saveRemoteInfo({ system: hpcConfig }, jobId, formatted, currentDbInfo);
  } catch (err) {
    log.error({ jobId, err }, "updateJobInfo error");
  }
}
