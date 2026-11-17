/**
 * Admin writes for applications. Everything goes to the site folder
 * ($QHPC_CONFIG_DIR/apps), never to the shipped apps/ tree, so upgrades keep
 * site edits. Reads pick the changes up on the next request (see lib/apps.ts).
 */

import fs from 'fs';
import path from 'path';
import { invalidate } from './config/cache';
import {
  APP_ID, appPaths, getAppForm, getAppList, reloadApps, siteAppsDir, siteListPath, type AppMeta,
} from './apps';

export const OVERRIDE_FILE = '95-admin.json';

/** Meta fields an admin may set. Everything else in a request is ignored. */
const META_KEYS = ['name', 'description', 'tags', 'logo', 'remote', 'nobatch', 'hidden', 'parser', 'licensing', 'terminal'] as const;

type ListFile = Record<string, Record<string, Partial<AppMeta>>>;

function readSiteList(): ListFile {
  try {
    return JSON.parse(fs.readFileSync(siteListPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file); // atomic: readers never see a half-written file
  invalidate(file);
}

function writeSiteList(list: ListFile) {
  writeJson(siteListPath, list);
  reloadApps();
}

export function assertIds(domain: string, app: string) {
  if (!APP_ID.test(domain) || !APP_ID.test(app)) {
    throw new AppAdminError('Ids must be lowercase letters, digits, "-" or "_" (max 64)', 400);
  }
}

export class AppAdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function pickMeta(input: Record<string, unknown>): Partial<AppMeta> {
  const out: Partial<AppMeta> = {};
  for (const k of META_KEYS) if (k in input) (out as any)[k] = input[k];
  if (out.name !== undefined && (typeof out.name !== 'string' || !out.name.trim())) {
    throw new AppAdminError('Name must be a non-empty string');
  }
  if (out.tags !== undefined && (!Array.isArray(out.tags) || out.tags.some((t) => typeof t !== 'string'))) {
    throw new AppAdminError('Tags must be a list of strings');
  }
  return out;
}

/** Merge meta fields into the site entry for an app. */
export function updateMeta(domain: string, app: string, meta: Partial<AppMeta>) {
  const list = readSiteList();
  (list[domain] ||= {})[app] = { ...list[domain]?.[app], ...meta };
  writeSiteList(list);
}

const EMPTY_FORM = {
  fields: {},
  parameters: {
    appBinaries: {},
    mainCommand: '',
    default: {},
  },
};

/** Create a new site application, blank or as a copy of another one. */
export async function createApp(
  domain: string,
  app: string,
  meta: Partial<AppMeta>,
  cloneFrom?: { domain: string; app: string },
) {
  assertIds(domain, app);
  if (getAppList().appList[domain]?.[app]) throw new AppAdminError(`${domain}/${app} already exists`, 409);

  let form: any = EMPTY_FORM;
  let baseMeta: Partial<AppMeta> = {};
  if (cloneFrom) {
    const src = getAppList().appList[cloneFrom.domain]?.[cloneFrom.app];
    if (!src) throw new AppAdminError('Application to copy not found', 404);
    form = await getAppForm(cloneFrom.domain, cloneFrom.app, false);
    const { appDomain: _d, appName: _a, origin: _o, ...rest } = src;
    baseMeta = rest;
  }

  writeJson(appPaths(domain, app).siteBase, form);
  updateMeta(domain, app, { ...baseMeta, ...meta });
}

/** Site-added app: delete it. Shipped app: drop every site change (back to defaults). */
export function deleteOrReset(domain: string, app: string) {
  const p = appPaths(domain, app);
  const list = readSiteList();
  if (list[domain]) {
    delete list[domain][app];
    if (Object.keys(list[domain]).length === 0) delete list[domain];
  }
  fs.rmSync(p.siteBase, { force: true });
  fs.rmSync(p.siteDropin, { recursive: true, force: true });
  // Legacy location of admin form overrides (before the site folder existed)
  fs.rmSync(path.join(p.shippedDropin, OVERRIDE_FILE), { force: true });
  writeSiteList(list);
}

/** Save the admin form override (force-replace of fields and parameters). */
export function saveFormOverride(domain: string, app: string, body: { fields?: unknown; parameters?: unknown }) {
  const dropin: Record<string, unknown> = {};
  if (body.fields) dropin['fields='] = body.fields;
  if (body.parameters) dropin['parameters='] = body.parameters;
  writeJson(path.join(appPaths(domain, app).siteDropin, OVERRIDE_FILE), dropin);
  // A legacy override in the shipped tree would load before the site one and is now redundant.
  fs.rmSync(path.join(appPaths(domain, app).shippedDropin, OVERRIDE_FILE), { force: true });
}

export function readFormOverride(domain: string, app: string): unknown {
  const p = appPaths(domain, app);
  for (const file of [path.join(p.siteDropin, OVERRIDE_FILE), path.join(p.shippedDropin, OVERRIDE_FILE)]) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { /* missing or corrupt: try the next one */ }
  }
  return null;
}

export function removeFormOverride(domain: string, app: string) {
  const p = appPaths(domain, app);
  fs.rmSync(path.join(p.siteDropin, OVERRIDE_FILE), { force: true });
  fs.rmSync(path.join(p.shippedDropin, OVERRIDE_FILE), { force: true });
}

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

const MAX_LOGO = 512 * 1024;

/** Detect the image type from magic bytes; SVG is refused (it can carry script). */
function imageExt(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export function saveLogo(domain: string, app: string, buf: Buffer): string {
  if (buf.length > MAX_LOGO) throw new AppAdminError('Logo is larger than 512 KB');
  const ext = imageExt(buf);
  if (!ext) throw new AppAdminError('Logo must be a PNG, JPEG or WebP image');
  const dir = path.join(siteAppsDir, 'img');
  fs.mkdirSync(dir, { recursive: true });
  for (const old of ['png', 'jpg', 'webp']) fs.rmSync(path.join(dir, `${domain}--${app}.${old}`), { force: true });
  const file = `${domain}--${app}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  const url = `/apps/${file}?v=${Date.now()}`; // version busts the browser cache
  updateMeta(domain, app, { logo: url });
  return url;
}

// ---------------------------------------------------------------------------
// Export / import (sharing format for community templates)
// ---------------------------------------------------------------------------

export const BUNDLE_FORMAT = 'qhpc-app/1';

export interface AppBundle {
  format: typeof BUNDLE_FORMAT;
  domain: string;
  app: string;
  meta: Partial<AppMeta>;
  form: unknown;
  /** Parser recipe, when the app uses one (see lib/parsers/recipe.ts). */
  recipe?: unknown;
}

export async function exportApp(domain: string, app: string, recipe?: unknown): Promise<AppBundle> {
  const meta = getAppList().appList[domain]?.[app];
  if (!meta) throw new AppAdminError('Unknown application', 404);
  const { appDomain: _d, appName: _a, origin: _o, logo: _l, ...rest } = meta;
  const bundle: AppBundle = {
    format: BUNDLE_FORMAT,
    domain,
    app,
    meta: rest,
    // Without the global drop-ins: the importing site applies its own.
    form: await getAppForm(domain, app, false),
  };
  if (recipe) bundle.recipe = recipe;
  return bundle;
}

export function validateBundle(b: any): AppBundle {
  if (!b || typeof b !== 'object' || b.format !== BUNDLE_FORMAT) {
    throw new AppAdminError(`Not a ${BUNDLE_FORMAT} bundle`);
  }
  assertIds(b.domain, b.app);
  if (!b.form || typeof b.form !== 'object' || Array.isArray(b.form)) throw new AppAdminError('Bundle has no form');
  return b as AppBundle;
}

/** Write an imported app as a site app (base template + meta). */
export function importApp(b: AppBundle, overwrite: boolean) {
  const exists = !!getAppList().appList[b.domain]?.[b.app];
  if (exists && !overwrite) throw new AppAdminError(`${b.domain}/${b.app} already exists`, 409);
  const meta = pickMeta((b.meta ?? {}) as Record<string, unknown>);
  delete meta.logo; // logos are not part of the bundle
  // A site base replaces the shipped base, and site drop-ins from a previous version are dropped.
  fs.rmSync(appPaths(b.domain, b.app).siteDropin, { recursive: true, force: true });
  writeJson(appPaths(b.domain, b.app).siteBase, b.form);
  updateMeta(b.domain, b.app, meta);
}
