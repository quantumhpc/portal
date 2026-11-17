/**
 * Application Registry
 *
 * Loads HPC application metadata and job-submission form templates.
 *
 * Two layers: the shipped `apps/` tree (read-only defaults, replaced on
 * upgrade) and the site folder `$QHPC_CONFIG_DIR/apps/` (admin edits, kept on
 * upgrade). Both are read on every call (JSON parse is mtime-cached), so
 * edits apply with no restart.
 *
 * App list: apps/applist.json, then site applist.json (per-app fields
 * override; `"hidden": true` removes an app from users' lists).
 *
 * Template loading order (later entries override earlier ones):
 *   1. apps/templates/all/*.json           – global defaults for all apps
 *   2. base {domain}/{app}.json            – site copy if present, else shipped
 *   3. shipped {domain}/{app}.d/*.json     – drop-ins (sorted)
 *   4. site    {domain}/{app}.d/*.json     – drop-ins, incl. 95-admin.json
 *
 * Drop-in merge operators (suffix on JSON key):
 *   key+   append value to array / string
 *   key-   prepend value to array / string
 *   key=   force-replace (skip deep merge even if target is an object)
 *   key    default: deep merge for objects, replace for primitives/arrays
 *
 * Manager-type filtering:
 *   Drop-in filenames containing a different manager type token (pbs, slurm,
 *   winhpc, torque, lsf) than the current manager are skipped automatically.
 */

import fs   from 'fs';
import path from 'path';
import { getConfig, configFolder } from './config';
import { tryLoadJson, invalidate } from './config/cache';

const appsDir      = path.join(process.cwd(), 'apps');
const templatesDir = path.join(appsDir, 'templates');
const globalsDir   = path.join(templatesDir, 'all');
const shippedList  = path.join(appsDir, 'applist.json');

/** Site-owned app data (survives upgrades): $QHPC_CONFIG_DIR/apps */
export const siteAppsDir = path.join(configFolder, 'apps');

/** Logo folders, site first. */
export function appImageDirs(): string[] {
  return [path.join(siteAppsDir, 'img'), path.join(appsDir, 'img')];
}

export const siteTemplatesDir = path.join(siteAppsDir, 'templates');
export const siteListPath     = path.join(siteAppsDir, 'applist.json');

/** Allowed domain / app id: lowercase, digits, dash, underscore. */
export const APP_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppMeta {
  appDomain: string;
  appName:   string;
  name:      string;
  logo?:     string;
  description?: string;
  remote?:   boolean;
  nobatch?:  boolean;
  tags?:     string[];
  provide?:  string[];
  require?:  string[];
  licensing?: any;
  /** Legacy `{ post: [...] }` or `{ source, id }` (see lib/parsers/index.ts). */
  parser?: any;
  hidden?:   boolean;
  /** 'shipped' | 'site' (added by an admin) — set by getAppList */
  origin?:   'shipped' | 'site';
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Drop-in merge engine
// ---------------------------------------------------------------------------

/** Known manager type tokens — used to filter drop-ins by current manager */
const MANAGER_TOKENS = ['pbs', 'slurm', 'winhpc', 'torque', 'lsf'];

/**
 * Returns true if a drop-in filename is compatible with the given manager.
 * A file is excluded only when it explicitly names a *different* manager.
 */
function isCompatibleDropin(filename: string, manager: string): boolean {
  const lower = filename.toLowerCase();
  const compatible = MANAGER_TOKENS.every(
    (token) => token === manager || !lower.includes(`-${token}-`) && !lower.includes(`-${token}.`),
  );
  const msg = compatible ? 'Including' : 'Excluding';
  console.debug(`${msg} drop-in: ${filename} (manager: ${manager})`);
  return compatible;
}

/**
 * Merge a drop-in JSON object into a target object, respecting merge operators.
 */
function applyDropin(target: any, dropin: any): void {
  for (const rawKey of Object.keys(dropin)) {
    const lastChar = rawKey[rawKey.length - 1];
    const hasOp = lastChar === '+' || lastChar === '-' || lastChar === '=';
    const key   = hasOp ? rawKey.slice(0, -1) : rawKey;
    const op    = hasOp ? lastChar : null;
    const src   = dropin[rawKey];

    if (op === '=') {
      // Force replace
      target[key] = src;
    } else if (op === '+') {
      // Append
      if (Array.isArray(target[key])) {
        target[key] = target[key].concat(Array.isArray(src) ? src : [src]);
      } else if (typeof target[key] === 'string') {
        target[key] = target[key] + src;
      } else {
        target[key] = src;
      }
    } else if (op === '-') {
      // Prepend
      if (Array.isArray(target[key])) {
        target[key] = (Array.isArray(src) ? src : [src]).concat(target[key]);
      } else if (typeof target[key] === 'string') {
        target[key] = src + target[key];
      } else {
        target[key] = src;
      }
    } else {
      // Default: deep merge for plain objects, replace otherwise
      if (
        src !== null &&
        typeof src === 'object' &&
        !Array.isArray(src) &&
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        applyDropin(target[key], src);
      } else {
        target[key] = src;
      }
    }
  }
}

/**
 * Load and sort JSON files from a directory, returning parsed objects.
 * Skips files that are incompatible with the current manager.
 */
function loadDropins(dir: string, manager: string): any[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && isCompatibleDropin(f, manager))
    .sort()
    .map((f) => {
      try {
        console.debug(`Loading drop-in file: ${path.join(dir, f)}`);
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// App list
// ---------------------------------------------------------------------------

type ListFile = Record<string, Record<string, Partial<AppMeta>>>;

interface AppListResult {
  /** domain → app → meta, including hidden apps (for lookups and admin) */
  appList:    Record<string, Record<string, AppMeta>>;
  appsBatch:  AppMeta[];
  appsRemote: AppMeta[];
  /** visible apps */
  appsJson:   AppMeta[];
  /** every app, hidden ones included (admin) */
  appsAll:    AppMeta[];
  appTags:    string[];
}

let lastShipped: unknown;
let lastSite: unknown;
let lastResult: AppListResult | null = null;

export function getAppList(): AppListResult {
  const shipped = tryLoadJson<ListFile>(shippedList) ?? {};
  const site    = tryLoadJson<ListFile>(siteListPath) ?? {};
  if (lastResult && shipped === lastShipped && site === lastSite) return lastResult;

  const result: AppListResult = { appList: {}, appsBatch: [], appsRemote: [], appsJson: [], appsAll: [], appTags: [] };
  for (const domain of new Set([...Object.keys(shipped), ...Object.keys(site)])) {
    for (const appName of new Set([...Object.keys(shipped[domain] ?? {}), ...Object.keys(site[domain] ?? {})])) {
      const base = shipped[domain]?.[appName];
      const app: AppMeta = {
        ...base,
        ...site[domain]?.[appName],
        appDomain: domain,
        appName,
        name: site[domain]?.[appName]?.name ?? base?.name ?? appName,
        origin: base ? 'shipped' : 'site',
      };
      (result.appList[domain] ||= {})[appName] = app;
      result.appsAll.push(app);
      if (app.hidden) continue;
      if (!app.nobatch) result.appsBatch.push(app);
      if (app.remote)   result.appsRemote.push(app);
      result.appsJson.push(app);
      for (const tag of app.tags ?? []) if (!result.appTags.includes(tag)) result.appTags.push(tag);
    }
  }
  lastShipped = shipped;
  lastSite = site;
  lastResult = result;
  return result;
}

// ---------------------------------------------------------------------------
// App form (template) loading
// ---------------------------------------------------------------------------

/** Paths of every layer for one app (shipped and site). */
export function appPaths(appDomain: string, appName: string) {
  return {
    shippedBase:   path.join(templatesDir, appDomain, `${appName}.json`),
    shippedDropin: path.join(templatesDir, appDomain, `${appName}.d`),
    siteBase:      path.join(siteTemplatesDir, appDomain, `${appName}.json`),
    siteDropin:    path.join(siteTemplatesDir, appDomain, `${appName}.d`),
  };
}

/**
 * Load and merge the full template for an app. Built on each call from
 * fresh JSON (templates are small), so file edits apply immediately.
 *
 * @param includeGlobals false for exports: apps/templates/all is applied on import
 */
export async function getAppForm(
  appDomain: string,
  appName:   string,
  includeGlobals = true,
): Promise<any> {
  if (!APP_ID.test(appDomain) || !APP_ID.test(appName)) {
    throw new Error(`Invalid application id: ${appDomain}/${appName}`);
  }
  const manager = getConfig().mainConfig.manager ?? 'slurm';
  return buildAppForm(appDomain, appName, manager, includeGlobals);
}

function buildAppForm(appDomain: string, appName: string, manager: string, includeGlobals: boolean): any {
  const p = appPaths(appDomain, appName);
  const template: any = {};

  // 1. Global defaults (apps/templates/all/*.json)
  if (includeGlobals) {
    for (const dropin of loadDropins(globalsDir, manager)) applyDropin(template, dropin);
  }

  // 2. Base template: site copy wins (site-added apps only have that one)
  const basePath = fs.existsSync(p.siteBase) ? p.siteBase : p.shippedBase;
  if (!fs.existsSync(basePath)) {
    throw new Error(`Template not found for ${appDomain}/${appName}`);
  }
  console.debug(`Loading base template: ${basePath}`);
  applyDropin(template, JSON.parse(fs.readFileSync(basePath, 'utf8')));

  // 3–4. Drop-ins: shipped, then site
  for (const dir of [p.shippedDropin, p.siteDropin]) {
    for (const dropin of loadDropins(dir, manager)) applyDropin(template, dropin);
  }

  // 5. Resolve glob patterns in appBinaries values
  if (template.parameters?.appBinaries) {
    for (const ver of Object.keys(template.parameters.appBinaries)) {
      const val = template.parameters.appBinaries[ver];
      if (typeof val === 'string' && val.includes('*')) {
        const resolved = resolveGlob(val);
        if (resolved) template.parameters.appBinaries[ver] = resolved;
      }
    }
  }

  return template;
}

function resolveGlob(pattern: string): string | null {
  const dir  = path.dirname(pattern);
  const base = path.basename(pattern);
  const re   = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  if (!fs.existsSync(dir)) return null;
  const matches = fs.readdirSync(dir).filter((f) => re.test(f));
  return matches.length > 0 ? path.join(dir, matches[matches.length - 1]) : null;
}

// ---------------------------------------------------------------------------
// Admin: reload
// ---------------------------------------------------------------------------

/** Kept for the admin "reload" action; everything is already mtime-checked. */
export function reloadApps(): void {
  invalidate(shippedList);
  invalidate(siteListPath);
  lastResult = null;
}
