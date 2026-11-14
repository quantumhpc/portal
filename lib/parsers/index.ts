/**
 * Parser registry.
 * Maps HPC application names (as they appear in apps/applist.json) to their
 * pre- and post-processor functions so the monitoring API can load the correct
 * parser for any running job.
 */

import type { ParserEntry } from './types';

import ansysFluent,       { require as fluentReq }    from './ansys_fluent';
import ansysCfx,          { require as cfxReq }       from './ansys_cfx';
import ansysMech,         { require as mechReq }       from './ansys_mech';
import ansysMechPre                                    from './ansys_mech_pre';
import dassaultAbaqus,    { require as abaqusReq }     from './dassault_abaqus';
import dassaultAbaqusPre                               from './dassault_abaqus_pre';
import altairOptistruct,  { require as optiReq }       from './altair_optistruct';
import starCcm,           { require as starReq }       from './star_ccm';
import openfoam,          { require as foamReq }       from './openfoam';

import { getAppList } from '../apps';
import { makeRecipeParser } from './recipe';
import { readRecipe, loadFileParser } from './site';

export type { ParserFn, PreProcessorFn, ParserResult, ParserEntry } from './types';

/** Registry: appName → ParserEntry */
const REGISTRY: Record<string, ParserEntry> = {
  ansys_fluent: {
    require: fluentReq,
    post:    ansysFluent,
  },
  ansys_cfx: {
    require: cfxReq,
    post:    ansysCfx,
  },
  'ansys_mech': {
    require: mechReq,
    pre:     ansysMechPre,
    post:    ansysMech,
  },
  'dassault_abaqus': {
    require: abaqusReq,
    pre:     dassaultAbaqusPre,
    post:    dassaultAbaqus,
  },
  'altair_optistruct': {
    require: optiReq,
    post:    altairOptistruct,
  },
  'star-ccm': {
    require: starReq,
    post:    starCcm,
  },
  openfoam: {
    require: foamReq,
    post:    openfoam,
  },
};

/** Names of the built-in parsers (for the admin parser picker). */
export const BUILTIN_PARSERS = Object.keys(REGISTRY);

/**
 * Which parser an app uses, from its `parser` setting in the app list:
 *   { source: "builtin", id }  a parser above
 *   { source: "recipe", id }   $QHPC_CONFIG_DIR/apps/parsers/<id>.json
 *   { source: "file", id }     $QHPC_CONFIG_DIR/apps/parsers/<id>.js
 *   { source: "none" }         no chart
 * Anything else (including the legacy `{ post: [...] }`) falls back to the
 * built-in with the same name as the app.
 */
export type ParserRef = { source: 'builtin' | 'recipe' | 'file' | 'none'; id?: string };

export function parserRef(meta: { appName: string; parser?: any } | undefined | null): ParserRef {
  const p = meta?.parser;
  if (p && typeof p === 'object' && ['builtin', 'recipe', 'file', 'none'].includes(p.source)) return p;
  return { source: 'builtin', id: meta?.appName };
}

/**
 * Resolve the parser for an application. Throws when a configured recipe or
 * file is missing or refused, so the job page can show why.
 */
export function resolveParser(appDomain: string, appName: string): ParserEntry | null {
  const ref = parserRef(getAppList().appList[appDomain]?.[appName] ?? { appName });
  switch (ref.source) {
    case 'none':
      return null;
    case 'recipe': {
      const recipe = readRecipe(ref.id ?? '');
      if (!recipe) throw new Error(`Parser recipe "${ref.id}" not found`);
      return { require: recipe.file ?? 'outputFile', post: makeRecipeParser(recipe) };
    }
    case 'file':
      return loadFileParser(ref.id ?? '');
    default:
      return REGISTRY[ref.id ?? appName] ?? null;
  }
}

/** Built-in entry by name. */
export function getParserEntry(appName: string): ParserEntry | null {
  return REGISTRY[appName] ?? null;
}

export default REGISTRY;
