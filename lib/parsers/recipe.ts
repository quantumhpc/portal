/**
 * Regex "recipe" parsers, defined by admins in the UI (no code).
 *
 * A recipe is JSON. Each line of the solver log is matched against:
 *   - iteration: sets the x value for the points that follow (e.g. "Time = 0.5")
 *   - series:    each match adds one point; `label` may use $1.. from the match
 *   - outputs:   last match wins, shown as stat tiles (run time, cells, …)
 *   - end:       success / error patterns, shown as a banner
 *
 * makeRecipeParser() returns a ParserFn with the same contract as the
 * built-in parsers, so job pages need no special case.
 */

import type { CustomOutput, GraphSeries, ParserFn, ParserResult } from './types';

export interface RecipeSeries {
  pattern: string;
  /** Series name; "$1" etc. are replaced by capture groups. */
  label: string;
  /** Capture group holding the value (default 1). */
  value?: number;
  /** Keep only the first match per iteration (e.g. several pressure correctors). */
  firstPerIteration?: boolean;
}

export interface Recipe {
  /** Which job file to read. */
  file?: 'outputFile' | 'historyFile';
  /** Plot log10 of the values (residuals). */
  logScale?: boolean;
  iteration?: { pattern: string; group?: number };
  series: RecipeSeries[];
  outputs?: { label: string; pattern: string; group?: number; type?: 'Text' | 'Number' | 'Time' }[];
  end?: { success?: string; error?: string };
}

const MAX_PATTERNS = 20;
// shortcut: lines are cut before matching to bound slow regexes; move matching to a worker with a timeout if a site needs more.
const MAX_LINE = 2000;

export class RecipeError extends Error {}

function compile(pattern: unknown, where: string): RegExp {
  if (typeof pattern !== 'string' || !pattern) throw new RecipeError(`${where}: pattern is required`);
  try {
    return new RegExp(pattern);
  } catch (e) {
    throw new RecipeError(`${where}: ${(e as Error).message}`);
  }
}

/** Check a recipe and compile its patterns. Throws RecipeError with a readable message. */
export function compileRecipe(r: Recipe) {
  if (!r || typeof r !== 'object') throw new RecipeError('Recipe must be an object');
  if (!Array.isArray(r.series) || r.series.length === 0) throw new RecipeError('Add at least one series');
  const count = r.series.length + (r.outputs?.length ?? 0) + (r.iteration ? 1 : 0) + (r.end?.success ? 1 : 0) + (r.end?.error ? 1 : 0);
  if (count > MAX_PATTERNS) throw new RecipeError(`At most ${MAX_PATTERNS} patterns`);
  return {
    iteration: r.iteration ? { re: compile(r.iteration.pattern, 'Iteration'), group: r.iteration.group ?? 1 } : null,
    series: r.series.map((s, i) => {
      if (typeof s.label !== 'string' || !s.label) throw new RecipeError(`Series ${i + 1}: label is required`);
      return { ...s, re: compile(s.pattern, `Series ${i + 1}`), group: s.value ?? 1 };
    }),
    outputs: (r.outputs ?? []).map((o, i) => {
      if (typeof o.label !== 'string' || !o.label) throw new RecipeError(`Output ${i + 1}: label is required`);
      return { ...o, re: compile(o.pattern, `Output ${i + 1}`), group: o.group ?? 1 };
    }),
    success: r.end?.success ? compile(r.end.success, 'Success') : null,
    error: r.end?.error ? compile(r.end.error, 'Error') : null,
  };
}

const sub = (label: string, m: RegExpMatchArray) => label.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');

/** Run a recipe over log text. Also used by the admin "test" pane. */
export function runRecipe(recipe: Recipe, text: string, startLine = 0): ParserResult & { matchedLines: number[] } {
  const c = compileRecipe(recipe);
  const lines = text.split('\n');
  const series = new Map<string, GraphSeries>();
  const seenThisIter = new Set<string>();
  const outputs: Record<string, CustomOutput> = {};
  const matchedLines: number[] = [];
  let message: { text: string; type: 'success' | 'error' } | undefined;
  let iteration = 0;
  let terminated = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].length > MAX_LINE ? lines[i].slice(0, MAX_LINE) : lines[i];
    let matched = false;

    if (c.iteration) {
      const m = line.match(c.iteration.re);
      if (m) {
        const x = Number(m[c.iteration.group]);
        if (Number.isFinite(x)) {
          iteration = x;
          seenThisIter.clear();
          matched = true;
        }
      }
    }

    for (const s of c.series) {
      const m = line.match(s.re);
      if (!m) continue;
      const label = sub(s.label, m);
      let y = Number(m[s.group]);
      if (!Number.isFinite(y)) continue;
      if (recipe.logScale) {
        if (y <= 0) continue;
        y = Math.log10(y);
      }
      if (s.firstPerIteration && c.iteration) {
        if (seenThisIter.has(label)) continue;
        seenThisIter.add(label);
      }
      let g = series.get(label);
      if (!g) series.set(label, (g = { label, data: [] }));
      g.data.push([c.iteration ? iteration : g.data.length + 1, y]);
      matched = true;
    }

    for (const o of c.outputs) {
      const m = line.match(o.re);
      if (!m) continue;
      const raw = m[o.group] ?? '';
      const type = o.type ?? 'Text';
      outputs[o.label] = { label: o.label, type, value: type === 'Text' ? raw : Number(raw) };
      matched = true;
    }

    if (c.error && c.error.test(line)) {
      message = { text: line.trim(), type: 'error' };
      matched = true;
    } else if (c.success && c.success.test(line)) {
      message = { text: 'The solver finished successfully.', type: 'success' };
      terminated = true;
      matched = true;
    }

    if (matched) matchedLines.push(i);
  }

  return {
    graph: [...series.values()],
    markings: [],
    step: { lastLine: lines.length, lastIter: iteration, terminated },
    custom: {
      ...(message ? { message } : {}),
      ...(Object.keys(outputs).length ? { outputs } : {}),
    },
    matchedLines,
  };
}

export function makeRecipeParser(recipe: Recipe): ParserFn {
  return (outputFile, startLine, _startIter, _files, next) => {
    try {
      const { matchedLines: _m, ...result } = runRecipe(recipe, outputFile, Number(startLine) || 0);
      next(null, result);
    } catch (e) {
      next(e as Error, undefined as unknown as ParserResult);
    }
  };
}
