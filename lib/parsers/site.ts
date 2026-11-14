/**
 * Site parsers in $QHPC_CONFIG_DIR/apps/parsers/:
 *   <id>.json — regex recipe, editable in Admin → Applications → Parser
 *   <id>.js   — JavaScript drop-in for formats a recipe can't handle.
 *               CommonJS: module.exports = { require: 'outputFile', post, pre }
 *               with post/pre following lib/parsers/types.ts.
 *
 * JS drop-ins run inside the portal process (root in production). They are
 * never uploaded through the browser: an admin with shell access places them,
 * and they load only if the file and its folder belong to the portal's own
 * user and are not writable by group or others.
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { siteAppsDir, APP_ID } from '../apps';
import { loadJson, invalidate } from '../config/cache';
import { compileRecipe, type Recipe } from './recipe';
import type { ParserEntry } from './types';

export const siteParsersDir = path.join(siteAppsDir, 'parsers');

export class ParserFileError extends Error {}

function parserPath(id: string, ext: 'json' | 'js'): string {
  if (!APP_ID.test(id)) throw new ParserFileError('Parser ids are lowercase letters, digits, "-" or "_"');
  return path.join(siteParsersDir, `${id}.${ext}`);
}

// ---- recipes ----

export function readRecipe(id: string): Recipe | null {
  try {
    return loadJson<Recipe>(parserPath(id, 'json'));
  } catch {
    return null;
  }
}

export function saveRecipe(id: string, recipe: Recipe) {
  compileRecipe(recipe); // throws RecipeError on a bad pattern
  const file = parserPath(id, 'json');
  fs.mkdirSync(siteParsersDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(recipe, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
  invalidate(file);
}

export function deleteRecipe(id: string) {
  fs.rmSync(parserPath(id, 'json'), { force: true });
}

// ---- JS drop-ins ----

/** Refuse files another user could have written. */
export function checkOwnership(file: string) {
  const uid = process.getuid?.();
  for (const p of [file, path.dirname(file)]) {
    const st = fs.statSync(p);
    if (uid !== undefined && st.uid !== uid) {
      throw new ParserFileError(`${p} must be owned by the portal user (uid ${uid})`);
    }
    if (st.mode & 0o022) {
      throw new ParserFileError(`${p} must not be writable by group or others (chmod go-w)`);
    }
  }
}

const fileCache = new Map<string, { mtimeMs: number; entry: ParserEntry }>();

export function loadFileParser(id: string): ParserEntry {
  const file = parserPath(id, 'js');
  const st = fs.statSync(file);
  checkOwnership(file);
  const hit = fileCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.entry;

  const mod = { exports: {} as any };
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {\n${fs.readFileSync(file, 'utf8')}\n})`,
    { filename: file },
  );
  wrapper(mod.exports, createRequire(file), mod, file, path.dirname(file));

  const m = mod.exports;
  if (typeof m.post !== 'function' && typeof m.pre !== 'function') {
    throw new ParserFileError(`${id}.js exports neither post() nor pre()`);
  }
  const entry: ParserEntry = { require: m.require, post: m.post, pre: m.pre };
  fileCache.set(file, { mtimeMs: st.mtimeMs, entry });
  return entry;
}

// ---- listing ----

export interface SiteParserInfo {
  id: string;
  kind: 'recipe' | 'file';
  /** For files: why it would be refused, if it would be. */
  error?: string;
}

export function listSiteParsers(): SiteParserInfo[] {
  if (!fs.existsSync(siteParsersDir)) return [];
  const out: SiteParserInfo[] = [];
  for (const f of fs.readdirSync(siteParsersDir).sort()) {
    const m = f.match(/^([a-z0-9][a-z0-9_-]*)\.(json|js)$/);
    if (!m) continue;
    if (m[2] === 'json') {
      out.push({ id: m[1], kind: 'recipe' });
      continue;
    }
    let error: string | undefined;
    try {
      checkOwnership(path.join(siteParsersDir, f));
    } catch (e) {
      error = (e as Error).message;
    }
    out.push({ id: m[1], kind: 'file', error });
  }
  return out;
}
