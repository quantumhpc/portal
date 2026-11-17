import path from "path";
import fs from "fs";
import os from "os";
import { loadJson, tryLoadJson, watch } from "./config/cache";
import { HpcConfigSchema } from "./hpc/config-schema";
import { log } from "./log";

// QHPC_CONFIG_DIR lets packaged installs keep site config outside the app
// tree (e.g. /etc/qhpc-portal); defaults to ./config.
export const configFolder = path.resolve(process.env.QHPC_CONFIG_DIR || path.join(process.cwd(), "config"));
const managersFolder = path.join(configFolder, "managers");
export const globalConfigPath = path.join(configFolder, "config.json");

log.debug({ configFolder }, "Config folder");

// Environment parsing
const nodeMode = process.env.NODE_ENV?.split(/-/g) ?? ["prod", "soft", "true"];
if (nodeMode.length !== 3) {
  nodeMode.length = 0;
  nodeMode.push("prod", "soft", "true");
}

const mode = nodeMode[0] === "dev" ? "development" : "production";
const isDev = mode === "development";
const isProd = mode === "production";
const isSaas = nodeMode[1] === "saas";
const isOnsite = nodeMode[2] === "true";

// Properties
const properties: Record<string, unknown> = {};
if (isDev) {
  try {
    const pkg = loadJson<{ version?: string }>(
      path.join(process.cwd(), "package.json")
    );
    properties.version = pkg.version || "0.0.0-dev";
  } catch {
    properties.version = "0.0.0-dev";
  }
  properties.releaseDate = new Date();
}

// Load the unified global config file. loadJson() caches by mtime, so a save
// from Admin → Configuration (or a hand edit) is picked up on the next access.
const EMPTY: Record<string, any> = {};
let warnedMissing = false;
function loadGlobalConfig(): Record<string, any> {
  try {
    const raw = loadJson<Record<string, any>>(globalConfigPath);
    if (isDev) watch(globalConfigPath);
    warnedMissing = false;
    return raw;
  } catch {
    if (!warnedMissing) log.warn({ globalConfigPath }, "config.json not found — using built-in defaults");
    warnedMissing = true;
    return EMPTY;
  }
}

const fileConfig = loadGlobalConfig();

// Restart-only: the temp dir is resolved once at startup (upload and token
// folders are derived from it).
const startupTmpdir = path.resolve((fileConfig.tmpdir as string) || os.tmpdir());
try {
  fs.mkdirSync(startupTmpdir, { recursive: true });
} catch {}

/** Keys that only take effect after a restart (shown as such in the admin UI). */
export const RESTART_KEYS = ["port", "https", "ssl_privateKey", "ssl_certificate", "ssl_chainfile", "tmpdir", "db"];

// Main config: file values + env overrides
function buildMainConfig(file: Record<string, any>): Record<string, any> {
  const main: Record<string, any> = {
    port: file.port ?? 8080,
    https: file.https ?? false,
    ssl_privateKey: file.ssl_privateKey ?? "ssl/privkey.pem",
    ssl_certificate: file.ssl_certificate ?? "ssl/cert.pem",
    ssl_chainfile: file.ssl_chainfile ?? "ssl/chain.pem",
    use_pam: process.env.USE_PAM != null
      ? /^(1|true|yes)$/i.test(process.env.USE_PAM)
      : (file.use_pam ?? true),
    pam_module: file.pam_module ?? "login",
    admin_users: process.env.ADMIN_USERS != null
      ? process.env.ADMIN_USERS.split(",").map(u => u.trim()).filter(Boolean)
      : (file.admin_users ?? []),
    manager: process.env.HPC_MANAGER || file.manager || "slurm",
    remote: file.remote ?? "turbovnc",
    remote_security: file.remote_security ?? "none",
    remote_domain: file.remote_domain ?? ".localdomain",
    lic_servers: file.lic_servers ?? {},
    tmpdir: startupTmpdir,
    upload_max_size_gb: file.upload_max_size_gb ?? 50,
    // Browser remote desktops (noVNC through websockify), see docs/remote-desktop.md
    vnc_websocket_url: file.vnc_websocket_url ?? "/vnc-ws",
    vnc_token_dir: file.vnc_token_dir ?? "",
    vnc_token_ttl_hours: file.vnc_token_ttl_hours ?? 12,
    memory: file.memory,
    memory_default: file.memory_default,
  };
  // PAM is Linux-only
  if (main.use_pam && process.platform === "win32") main.use_pam = false;
  return main;
}

let lastRaw: Record<string, any> | null = null;
let lastMain: Record<string, any> = {};
function getMainConfig(): Record<string, any> {
  const raw = loadGlobalConfig();
  if (raw !== lastRaw) {
    lastMain = buildMainConfig(raw);
    lastRaw = raw;
  }
  return lastMain;
}

// Database config: file values + env overrides
const fileDb = fileConfig.db ?? {};
const dbDriver = (process.env.DB_DRIVER || fileDb.driver || (isDev ? "sqlite" : "mongo")).toLowerCase() as "mongo" | "sqlite";
const dbHostname = process.env.MONGODB_HOST || fileDb.hostname || "localhost";
const dbPort = parseInt(process.env.MONGODB_PORT || String(fileDb.port ?? 27017), 10);
const dbDatabase = process.env.MONGODB_DATABASE || fileDb.database || "quanta";
const dbFile = path.resolve(process.env.SQLITE_FILE || fileDb.file || path.join("data", "qhpc.sqlite"));
const dbUser = fileDb.user || "";
const dbPassword = fileDb.password || "";

const dbURL = dbPassword
  ? `mongodb://${dbUser}:${dbPassword}@${dbHostname}:${dbPort}`
  : `mongodb://${dbHostname}:${dbPort}`;

const dbConfig = {
  driver: dbDriver,
  url: dbURL,
  database: dbDatabase,
  file: dbFile,
};

// HPC Manager config — lazy + mtime-cached
// "manager" is now just the scheduler name ("slurm" | "pbs"); keep _config suffix
// only when resolving legacy separate files.

function managerConfigPath(name: string): string {
  // Legacy: env var or separate file under config/managers/
  const envKey = `${name}_config`.toUpperCase();
  return process.env[envKey] || path.join(managersFolder, `${name}_config.json`);
}

interface DerivedManagerCacheEntry {
  sourceMtime: number;
  derived: Record<string, any>;
}

const derivedManagerCache = new Map<string, DerivedManagerCacheEntry>();

function globalMtime(): number {
  try { return fs.statSync(globalConfigPath).mtimeMs; } catch { return 0; }
}

function deriveManagerConfig(raw: Record<string, any>): Record<string, any> {
  const derived: Record<string, any> = { ...raw };

  if (derived.method === "local") {
    derived.useSharedDir = true;
    // Commands run after `cd <job dir>`, so a relative binariesDir (dev mocks) must be absolute.
    if (derived.binariesDir && !path.isAbsolute(derived.binariesDir)) {
      derived.binariesDir = path.resolve(derived.binariesDir);
    }
  }

  const mainConfig = getMainConfig();
  if (mainConfig.remote) derived.remote = mainConfig.remote;
  if (mainConfig.remote_security) derived.remote_security = mainConfig.remote_security;
  if (mainConfig.remote_domain) derived.remote_domain = mainConfig.remote_domain;

  derived.priority = {};
  if (mainConfig.manager === "pbs") {
    derived.priority.min = -1024;
    derived.priority.max = 1023;
  }

  if (mainConfig.memory === true) {
    derived.memory = {
      default: mainConfig.memory_default ? Number(mainConfig.memory_default) : 2,
    };
  } else {
    derived.memory = false;
  }

  return derived;
}

export function getManagerConfig(name: string = getMainConfig().manager): Record<string, any> {
  // Prefer inline config from config.json "managers" block
  const inline = (loadGlobalConfig().managers as Record<string, any> | undefined)?.[name];
  if (inline && typeof inline === "object") {
    const cacheKey = `inline:${name}`;
    const mtime = globalMtime();
    const hit = derivedManagerCache.get(cacheKey);
    if (hit && hit.sourceMtime === mtime) return hit.derived;

    const validated = HpcConfigSchema.safeParse(inline);
    if (!validated.success) {
      const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      log.warn({ name, issues }, "HPC config validation warning");
    }

    const derived = deriveManagerConfig(inline);
    derivedManagerCache.set(cacheKey, { sourceMtime: mtime, derived });
    return derived;
  }

  // Fallback: load from config/managers/{name}_config.json (legacy)
  const filePath = managerConfigPath(name);
  let sourceMtime = 0;
  let raw: Record<string, any> = {};
  try {
    // derived values also depend on config.json (remote, memory), so key on both
    sourceMtime = fs.statSync(filePath).mtimeMs + globalMtime();
    raw = loadJson<Record<string, any>>(filePath);
    if (isDev) watch(filePath);
  } catch {
    // No manager file: keep one object, so values cached on it (cluster_config) survive.
    const hit = derivedManagerCache.get(filePath);
    if (hit && hit.sourceMtime === -1) return hit.derived;
    const derived = deriveManagerConfig({});
    derivedManagerCache.set(filePath, { sourceMtime: -1, derived });
    return derived;
  }

  const hit = derivedManagerCache.get(filePath);
  if (hit && hit.sourceMtime === sourceMtime) return hit.derived;

  const validated = HpcConfigSchema.safeParse(raw);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    log.warn({ filePath, issues }, "HPC config validation warning");
  }

  const derived = deriveManagerConfig(raw);
  derivedManagerCache.set(filePath, { sourceMtime, derived });
  return derived;
}

/**
 * Resolve working/shared dirs for an indexed scratch entry.
 */
export function getDirs(
  cfg: Record<string, any>,
  index?: number
): { workingDir: any; sharedDir: any } {
  if (!Array.isArray(cfg.workingDir)) {
    return { workingDir: cfg.workingDir, sharedDir: cfg.sharedDir };
  }
  const idx = index ? Number(index) : 0;
  return {
    workingDir: cfg.workingDir[idx],
    sharedDir: cfg.sharedDir[idx],
  };
}

// License manager configs — lazy: rebuild from main lic_servers each access
function buildLicConfig(): Record<string, any> {
  const result: Record<string, any> = {};
  const { lic_servers } = getMainConfig();
  for (const lic in lic_servers) {
    const licType = lic_servers[lic].type;
    if (!licType || result[licType]) continue;
    const filePath = path.join(managersFolder, `${licType}_config.json`);
    const loaded = tryLoadJson<Record<string, any>>(filePath);
    if (loaded) {
      result[licType] = loaded;
      if (isDev) watch(filePath);
    } else {
      log.error({ licType }, "Cannot find configuration file for license type");
    }
  }
  return result;
}

export function getConfig() {
  return config;
}

export const config = {
  mode,
  isDev,
  isProd,
  isSaas,
  isOnsite,
  properties,
  get mainConfig(): Record<string, any> {
    return getMainConfig();
  },
  dbConfig,
  get managerConfigName(): string {
    return getMainConfig().manager;
  },
  get hpcGlobalConfig(): Record<string, any> {
    return getManagerConfig();
  },
  get licConfig(): Record<string, any> {
    return buildLicConfig();
  },
};

export default config;
