/**
 * Portal health: checks an administrator can run from Admin → Health, each with
 * a plain-language fix, and the support bundle built from them.
 *
 * Checks only read. Scheduler checks run as the administrator who asked (the
 * same path a user's request takes), never as the portal process.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { config, configFolder, getDirs, globalConfigPath } from '@/lib/config';
import { HpcConfigSchema } from '@/lib/hpc/config-schema';
import { getHpcUserConfig } from '@/lib/auth/hpc-config';
import { nodeList, queueList, type ManagerType } from '@/lib/hpc/managers';
import { spawnProcess, type SpawnResult } from '@/lib/hpc/exec';
import { getDb, dbDriver } from '@/lib/db/connection';
import { getAppList } from '@/lib/apps';
import { listSiteParsers } from '@/lib/parsers/site';
import type { AuthenticatedUser } from '@/lib/db/models/user';
import pkg from '../package.json';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface HealthCheck {
  group: string;
  title: string;
  status: CheckStatus;
  detail: string;
  /** What to do about a warn or fail. */
  fix?: string;
}

export interface HealthReport {
  generatedAt: string;
  versions: { portal: string; node: string; os: string };
  summary: Record<CheckStatus, number>;
  checks: HealthCheck[];
}

const isProd = process.env.NODE_ENV === 'production';

function nodeOk(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 20 || (major === 20 && minor >= 9);
}

/** A folder path from config, or null when it is a per-user template we can't check here. */
function checkable(p: unknown): string | null {
  return typeof p === 'string' && path.isAbsolute(p) && !/[{$]/.test(p) ? p : null;
}

function folderCheck(group: string, title: string, dir: string, needWrite: boolean): HealthCheck {
  try {
    const st = fs.statSync(dir);
    if (!st.isDirectory()) return { group, title, status: 'fail', detail: `${dir} is not a folder`, fix: `Point the setting to a folder, or create ${dir}.` };
    if (needWrite) fs.accessSync(dir, fs.constants.W_OK);
    const mode = (st.mode & 0o7777).toString(8).padStart(4, '0');
    // World-writable without the sticky bit: any user can delete another user's job folders.
    if (st.mode & 0o002 && !(st.mode & 0o1000)) {
      return { group, title, status: 'warn', detail: `${dir} (mode ${mode}) is writable by everyone without the sticky bit`, fix: `Run: chmod +t ${dir}` };
    }
    return { group, title, status: 'ok', detail: `${dir} (mode ${mode})` };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { group, title, status: 'fail', detail: `${dir} does not exist`, fix: `Create it (mkdir -p ${dir}) or fix the path in Admin → Configuration.` };
    return { group, title, status: 'fail', detail: `${dir}: ${(err as Error).message}`, fix: 'Check the folder permissions for the portal process.' };
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    return { error: (err as Error).message, ms: Date.now() - t0 };
  }
}

function portalChecks(): HealthCheck[] {
  const g = 'Portal';
  const out: HealthCheck[] = [];
  const node = process.versions.node;
  out.push(
    nodeOk(node)
      ? { group: g, title: 'Version', status: 'ok', detail: `QuantumHPC Portal ${pkg.version}, Node.js ${node}, ${isProd ? 'production' : 'development'} mode` }
      : { group: g, title: 'Version', status: 'fail', detail: `Node.js ${node} is too old`, fix: 'Install Node.js 20.9 or later, then reinstall the portal.' },
  );
  const local = config.hpcGlobalConfig.method !== 'ssh';
  const uid = process.getuid?.();
  if (local && uid !== 0) {
    out.push({
      group: g, title: 'Runs as root', status: isProd ? 'fail' : 'warn',
      detail: `The portal runs as uid ${uid}. With method "local" it must be root to start jobs and open files as each user.`,
      fix: 'Run the service as root (deploy/systemd/qhpc-portal.service does).',
    });
  } else {
    out.push({ group: g, title: 'Runs as root', status: 'ok', detail: local ? 'Yes: jobs and files run under each user\'s uid/gid' : 'Not needed: scheduler commands run over SSH' });
  }
  return out;
}

async function signInChecks(): Promise<HealthCheck[]> {
  const g = 'Security and sign-in';
  const out: HealthCheck[] = [];
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  out.push(
    secret.length >= 32
      ? { group: g, title: 'Session secret', status: 'ok', detail: 'NEXTAUTH_SECRET is set (32 characters or more)' }
      : { group: g, title: 'Session secret', status: isProd ? 'fail' : 'warn', detail: 'NEXTAUTH_SECRET is missing or shorter than 32 characters', fix: 'Set NEXTAUTH_SECRET to the output of `openssl rand -base64 48` and restart.' },
  );
  const main = config.mainConfig;
  if (!main.use_pam) {
    out.push({ group: g, title: 'Password check (PAM)', status: isProd ? 'fail' : 'warn', detail: 'use_pam is off: any password is accepted for any existing OS user', fix: 'Turn on use_pam in Admin → Configuration (or remove USE_PAM=false from the environment).' });
    return out;
  }
  const service = String(main.pam_module || 'login');
  const pamFile = path.join("/etc/pam.d", service);
  out.push(
    fs.existsSync(pamFile)
      ? { group: g, title: 'Password check (PAM)', status: 'ok', detail: `PAM service "${service}" (${pamFile})` }
      : { group: g, title: 'Password check (PAM)', status: 'fail', detail: `${pamFile} does not exist, so nobody can sign in`, fix: `Copy deploy/pam/qhpc-portal.rhel or .debian to ${pamFile}, or set pam_module to an existing service.` },
  );
  const lib = await timed(() => import('authenticate-pam'));
  out.push(
    lib.error
      ? { group: g, title: 'PAM library', status: 'fail', detail: `authenticate-pam does not load: ${lib.error}`, fix: 'Install the PAM development headers, then run `npm rebuild authenticate-pam`.' }
      : { group: g, title: 'PAM library', status: 'ok', detail: 'authenticate-pam loads' },
  );
  if (!(main.admin_users as string[])?.length) {
    out.push({ group: g, title: 'Administrators', status: 'warn', detail: 'admin_users is empty', fix: 'Add at least one account to admin_users in config.json.' });
  }
  return out;
}

async function schedulerChecks(user: AuthenticatedUser): Promise<HealthCheck[]> {
  const g = 'Scheduler';
  const out: HealthCheck[] = [];
  const manager = config.mainConfig.manager as ManagerType;
  const cfg = config.hpcGlobalConfig;

  const parsed = HpcConfigSchema.safeParse(cfg);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    out.push({ group: g, title: 'Scheduler settings', status: 'fail', detail: issues, fix: `Fix managers.${manager} in config.json (see docs/CONFIGURATION.md).` });
    return out;
  }
  out.push({ group: g, title: 'Scheduler settings', status: 'ok', detail: `${manager}, method "${cfg.method || 'local'}"${cfg.method === 'ssh' ? ` to ${cfg.serverName}` : ''}` });

  if (cfg.method !== 'ssh') {
    out.push(folderCheck(g, 'Scheduler commands folder', cfg.binariesDir, false));
  }

  let hpc;
  try {
    hpc = getHpcUserConfig(user);
  } catch (err) {
    out.push({ group: g, title: 'Scheduler answers', status: 'fail', detail: (err as Error).message, fix: 'Check secretAccessKey in the scheduler settings.' });
    return out;
  }

  const probe = manager === 'pbs' ? 'qstat' : 'sinfo';
  const ver = spawnProcess([cfg.binariesDir + probe, '--version'], 'shell', null, hpc) as SpawnResult;
  const version = ver?.stdout?.trim().split('\n')[0];

  // Fails fast when the scheduler is down (listing nodes would just come back empty).
  const ping = (manager === 'pbs'
    ? spawnProcess([cfg.binariesDir + 'qstat', '-B'], 'shell', null, hpc, { timeout: 15000 })
    : spawnProcess([cfg.binariesDir + 'scontrol', 'ping'], 'shell', null, hpc, { timeout: 15000 })) as SpawnResult;
  const up = manager === 'pbs' ? ping?.status === 0 && !ping.stderr?.trim() : /\bUP\b/.test(ping?.stdout ?? '');
  if (!up) {
    const said = (ping?.stderr || ping?.stdout || ping?.error || 'no answer').trim().split('\n').slice(0, 3).join(' ');
    out.push({
      group: g, title: 'Scheduler answers', status: 'fail',
      detail: `${manager === 'pbs' ? 'qstat -B' : 'scontrol ping'} as ${user.system.username}: ${said}`,
      fix: manager === 'slurm'
        ? 'Check that slurmctld is running and reachable from this host, and that munge runs here with the cluster key.'
        : 'Check that the PBS server is running and that this host can reach it.',
    });
    return out;
  }

  const nodes = await timed(() => nodeList(user, manager, hpc));
  const queues = await timed(() => queueList(user, manager, hpc));
  const error = nodes.error ?? queues.error;
  if (error) {
    out.push({
      group: g, title: 'Scheduler answers', status: 'fail',
      detail: `Listing nodes and queues as ${user.system.username} failed: ${error}`,
      fix: manager === 'slurm'
        ? 'Check that binariesDir holds sinfo/scontrol, that munge is running on this host, and that slurmctld answers (`scontrol ping`).'
        : 'Check that binariesDir holds qstat/pbsnodes and that this host can reach the PBS server.',
    });
    return out;
  }
  const nodeCount = nodes.value?.nodes?.length ?? 0;
  const down = (nodes.value?.nodes ?? []).filter((n: any) => n.state === 'down' || n.state === 'offline').length;
  out.push({
    group: g, title: 'Scheduler answers', status: nodeCount ? 'ok' : 'warn',
    detail: `${version ? version + ': ' : ''}${nodeCount} node(s), ${queues.value?.length ?? 0} queue(s), in ${nodes.ms + queues.ms} ms as ${user.system.username}`,
    fix: nodeCount ? undefined : 'The scheduler answers but lists no nodes: check the partition/queue configuration.',
  });
  if (down) {
    out.push({ group: g, title: 'Nodes down', status: 'warn', detail: `${down} of ${nodeCount} node(s) are down or offline`, fix: 'See Cluster → Nodes, then the scheduler logs on those nodes.' });
  }
  return out;
}

function storageChecks(): HealthCheck[] {
  const g = 'Storage';
  const out: HealthCheck[] = [];
  const cfg = config.hpcGlobalConfig;
  const { workingDir, sharedDir } = getDirs(cfg);
  const work = cfg.method !== 'ssh' ? checkable(workingDir) : null;
  if (work) out.push(folderCheck(g, 'Job folders (workingDir)', work, false));
  const shared = cfg.useSharedDir || cfg.method !== 'ssh' ? checkable(sharedDir) : null;
  if (shared && shared !== work) out.push(folderCheck(g, 'Shared folder (sharedDir)', shared, false));
  if (!work && !shared) out.push({ group: g, title: 'Job folders', status: 'ok', detail: 'Not checked from here (per-user or remote paths)' });
  out.push(folderCheck(g, 'Temporary folder (tmpdir)', config.mainConfig.tmpdir, true));
  return out;
}

async function databaseChecks(): Promise<HealthCheck[]> {
  const g = 'Database';
  const res = await timed(async () => (await getDb()).collection('jobs').countDocuments({}));
  const where = dbDriver === 'sqlite' ? `SQLite ${config.dbConfig?.file ?? ''}`.trim() : 'MongoDB';
  return [
    res.error
      ? { group: g, title: 'Database', status: 'fail', detail: `${where}: ${res.error}`, fix: dbDriver === 'sqlite' ? 'Check that the database folder exists and is writable by the portal.' : 'Check MONGODB_URI and that MongoDB is running.' }
      : { group: g, title: 'Database', status: 'ok', detail: `${where}: ${res.value} job record(s), answered in ${res.ms} ms` },
  ];
}

function siteChecks(): HealthCheck[] {
  const g = 'Site configuration';
  const out: HealthCheck[] = [];
  out.push(
    fs.existsSync(globalConfigPath)
      ? { group: g, title: 'Configuration file', status: 'ok', detail: globalConfigPath }
      : { group: g, title: 'Configuration file', status: 'warn', detail: `${globalConfigPath} not found: built-in defaults are used`, fix: `Copy config/config.example.json to ${globalConfigPath} and edit it.` },
  );
  const apps = getAppList();
  out.push({
    group: g, title: 'Applications', status: apps.appsAll.length ? 'ok' : 'warn',
    detail: `${apps.appsAll.length} application(s) (site folder ${configFolder}/apps)`,
    fix: apps.appsAll.length ? undefined : 'Add one in Admin → Applications.',
  });
  for (const p of listSiteParsers().filter((p) => p.error)) {
    out.push({ group: g, title: `Parser ${p.id}.js`, status: 'warn', detail: `Refused: ${p.error}`, fix: 'Fix the owner and permissions as the message says; the parser is ignored until then.' });
  }
  return out;
}

export async function runHealthChecks(user: AuthenticatedUser): Promise<HealthReport> {
  const checks = [
    ...portalChecks(),
    ...(await signInChecks()),
    ...(await schedulerChecks(user)),
    ...storageChecks(),
    ...(await databaseChecks()),
    ...siteChecks(),
  ];
  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status]++;
  return {
    generatedAt: new Date().toISOString(),
    versions: { portal: pkg.version, node: process.versions.node, os: `${os.type()} ${os.release()}` },
    summary,
    checks,
  };
}

// ---- Support bundle ----

/** Keys whose values never leave the server: passwords, secrets, tokens, connection strings, key files. */
const SECRET_KEY = /pass|secret|token|credential|(^|_)uri$|key$/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) && v !== '' && v != null ? '[redacted]' : redact(v)]),
    );
  }
  return value;
}

/** Environment variables the portal reads: only whether each is set, never the value. */
const ENV_NAMES = ['NODE_ENV', 'QHPC_CONFIG_DIR', 'HPC_MANAGER', 'USE_PAM', 'ADMIN_USERS', 'DB_DRIVER', 'SQLITE_FILE', 'MONGODB_URI', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET'];

export async function supportBundle(user: AuthenticatedUser) {
  const report = await runHealthChecks(user);
  return {
    format: 'qhpc-support/1',
    ...report,
    host: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, memoryGb: Math.round(os.totalmem() / 2 ** 30) },
    config: redact({ main: config.mainConfig, scheduler: config.hpcGlobalConfig }),
    env: Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n] ? 'set' : 'unset'])),
  };
}
