/**
 * HPC Execution Wrapper
 * Abstracts SSH and local command execution for interacting with HPC clusters.
 * Ported from api/hpc_exec_wrapperjs/exec.js
 */

import { spawnSync, SpawnSyncOptions, SpawnSyncReturns } from 'child_process';
import path from 'path';

const MAX_LENGTH = 36;
const UID_BLOCK = 'xxxxxxxxxxxx';
const isWin = /^win/.test(process.platform);

export interface HpcConfig {
  method: 'ssh' | 'local';
  sshExec: string;
  defaultOpts: string;
  scpExec: string;
  username: string;
  uid: number;
  gid: number;
  home?: string;
  serverName: string;
  secretAccessKey: string;
  localShell: string;
  localCopy: string;
  useSharedDir: boolean;
  sharedDir: string;
  workingDir: string;
  binariesDir: string;
  permissions?: string;
  limit?: number;
  useAlternate?: boolean;
  remote?: string;
  remote_security?: string;
  remote_domain?: string;
  console?: string;
  // Cluster config is populated at runtime
  cluster_config?: ClusterConfig;
}

export interface ClusterConfig {
  nodes: Record<string, NodeConfig>;
  gpus: Record<string, number>;
  globalTotalProcs: number;
  globalMaxProcs: number;
  globalTotMem: number;
  maxMemPerProc: number;
}

export interface NodeConfig {
  totMem: number;
  totalProcs: number;
  maxMemPerProc: number;
  features?: string[];
  gpu?: Array<{ model: string; count: number }>;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  error?: string;
  status?: number | null;
}

// Portal secrets must never reach user processes: schedulers such as Slurm
// export the submitting environment into the job by default.
const SECRET_ENV = /SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|CREDENTIAL|API_?KEY/i;

/**
 * Environment for a command run on behalf of a user: the portal's env minus
 * anything secret-looking, with HOME/USER/LOGNAME pointing at the user.
 */
type Env = Record<string, string | undefined>;

export function userEnv(
  config: Pick<HpcConfig, 'username' | 'home'>,
  base: Env = process.env
): Env {
  const env: Env = {};
  for (const [k, v] of Object.entries(base)) {
    if (!SECRET_ENV.test(k)) env[k] = v;
  }
  if (config.username) {
    env.USER = config.username;
    env.LOGNAME = config.username;
  }
  if (config.home) env.HOME = config.home;
  return env;
}

function sshAddress(config: HpcConfig): string {
  return `${config.username}@${config.serverName}`;
}

function quotes(text: string): string {
  return `"${text}"`;
}

/**
 * Get the locally mounted path for a remote path.
 * If the config uses SSH with a shared directory, translates the remote path
 * to the local mount point. For local method, normalizes the path.
 */
export function getMountedPath(config: HpcConfig, remotePath: string): string | null {
  if (config.method === 'ssh' && config.useSharedDir) {
    const subDir = path.relative(config.workingDir, remotePath);
    return path.join(config.sharedDir, subDir);
  } else if (config.method === 'local') {
    return path.normalize(remotePath);
  }
  return null;
}

/**
 * Get the original remote path from a locally mounted path.
 */
export function getOriginalPath(config: HpcConfig, mountedPath: string): string {
  if (config.useSharedDir) {
    const subDir = path.relative(config.sharedDir, mountedPath);
    return path.join(config.workingDir, subDir);
  }
  return path.normalize(mountedPath);
}

/**
 * Execute a command either locally or via SSH, or copy files via cp/scp.
 *
 * @param spawnCmd - For shell: [exec, arg1, arg2, ...]. For copy: [source, destination].
 * @param spawnType - 'shell' or 'copy'
 * @param spawnLocal - For shell: override SSH and run locally. For copy: true = source is local, false = destination is local.
 * @param config - Server configuration
 * @param opts - Additional spawn options
 */
export function spawnProcess(
  spawnCmd: string[],
  spawnType: 'shell' | 'copy',
  spawnLocal: boolean | null,
  config: HpcConfig,
  opts?: SpawnSyncOptions
): SpawnResult | true {
  let spawnExec: string;
  const spawnOpts: SpawnSyncOptions = {
    encoding: 'utf8' as BufferEncoding,
    timeout: 5000,
    ...opts,
    env: userEnv(config, opts?.env ?? process.env) as NodeJS.ProcessEnv,
  };

  if (!config.defaultOpts) {
    config.defaultOpts = '';
  }

  // Use UID and GID on local method
  if (!isWin && (config.method === 'local' || config.useSharedDir || spawnLocal)) {
    const uid = Number(config.uid);
    const gid = Number(config.gid);
    if (isNaN(uid) || isNaN(gid)) {
      return { stderr: 'Please specify valid uid/gid', stdout: '' };
    }
    spawnOpts.uid = uid;
    spawnOpts.gid = gid;
  }

  // Make a mutable copy
  let cmd = [...spawnCmd];

  switch (spawnType) {
    case 'shell':
      if (config.method === 'local' || spawnLocal) {
        spawnExec = cmd.shift()!;
        if (!isWin) {
          spawnOpts.shell = config.localShell;
        }
      } else {
        spawnExec = config.sshExec;
        cmd = [
          sshAddress(config),
          '-i', config.secretAccessKey,
          ...config.defaultOpts.split(' ').filter(Boolean),
          ...cmd,
        ];
      }
      break;

    case 'copy':
      switch (config.method) {
        case 'ssh': {
          let file: string;
          let destDir: string;

          if (config.useSharedDir) {
            spawnExec = config.localCopy;
            spawnOpts.shell = config.localShell;

            if (spawnLocal) {
              if (cmd[0].startsWith(config.sharedDir)) {
                const originalCmd = [config.localCopy, getOriginalPath(config, cmd[0]), cmd[1]];
                return spawnProcess(originalCmd, 'shell', null, config);
              }
              file = cmd[0];
              destDir = getMountedPath(config, cmd[1])!;
            } else {
              if (cmd[1].startsWith(config.sharedDir)) {
                const originalCmd = [config.localCopy, cmd[0], getOriginalPath(config, cmd[1])];
                return spawnProcess(originalCmd, 'shell', null, config);
              }
              file = getMountedPath(config, cmd[0])!;
              destDir = cmd[1];
            }

            // Fail-safe for same-file copy
            if (file === path.join(destDir, path.basename(file))) {
              return true;
            }
            cmd = [quotes(file), quotes(destDir)];
          } else {
            spawnExec = config.scpExec;
            if (spawnLocal) {
              file = cmd[0];
              destDir = `${sshAddress(config)}:${cmd[1]}`;
            } else {
              file = `${sshAddress(config)}:${cmd[0]}`;
              destDir = cmd[1];
            }
            cmd = [
              ...config.defaultOpts.split(' ').filter(Boolean),
              '-i', config.secretAccessKey,
              file, destDir,
            ];
          }
          break;
        }

        case 'local': {
          spawnExec = config.localCopy;
          spawnOpts.shell = isWin ? true as any : config.localShell;
          cmd = [quotes(cmd[0]), quotes(cmd[1])];
          break;
        }

        default:
          return { stderr: `Unknown method: ${config.method}`, stdout: '' };
      }
      break;

    default:
      return { stderr: `Unknown spawn type: ${spawnType}`, stdout: '' };
  }

  const result = spawnSync(spawnExec!, cmd, spawnOpts) as SpawnSyncReturns<string>;

  if (result.stderr) {
    // Retry on first SSH connect warning
    if (result.stderr.indexOf('Warning: Permanently added') > -1) {
      return spawnSync(spawnExec!, cmd, spawnOpts) as unknown as SpawnResult;
    }
    return {
      stdout: result.stdout || '',
      stderr: result.stderr,
      error: result.stderr,
      status: result.status,
    };
  }

  return {
    stdout: result.stdout || '',
    stderr: '',
    status: result.status,
  };
}

/**
 * Create a unique identifier, optionally incorporating text.
 */
export function createUID(text?: string): string {
  let folderName = '';
  let suffix = '';

  if (text) {
    folderName += text.substr(0, MAX_LENGTH - (UID_BLOCK.length + 1));
    suffix += '-' + UID_BLOCK;
  } else {
    suffix += UID_BLOCK + '-' + UID_BLOCK;
  }

  folderName += suffix.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  return folderName;
}

/**
 * Create a unique working directory on the HPC cluster.
 * Returns the remote path and optionally the locally mounted path.
 */
export async function createJobWorkDir(
  config: HpcConfig,
  folderHint?: string
): Promise<{ jobWorkingDir: string; mountedWorkingDir: string | null }> {
  const folder = createUID(folderHint);
  const jobWorkingDir = path.join(config.workingDir, folder);

  let mountedWorkingDir: string | null = null;
  let usedDir: string;

  if (config.useSharedDir) {
    mountedWorkingDir = path.join(config.sharedDir, folder);
    usedDir = mountedWorkingDir;
  } else {
    usedDir = jobWorkingDir;
  }

  let chmod = '';
  if (!isWin && config.permissions) {
    chmod = `-m ${config.permissions} `;
  }

  const mkdir = spawnProcess(
    [`[ -d ${usedDir} ] || mkdir ${chmod}${usedDir}`],
    'shell',
    config.useSharedDir,
    config
  );

  if (mkdir !== true && mkdir.stderr) {
    throw new Error(mkdir.stderr);
  }

  return { jobWorkingDir, mountedWorkingDir };
}
