/**
 * App template expansion for job submission.
 *
 * Templates (apps/templates) describe form fields and a command line with
 * placeholders. v1 expanded them in the browser; this module does it on the
 * server so the submitted command always matches the template. It has no Node
 * imports so the form can reuse evalCondition().
 *
 * Syntax (same as v1, plus the bracket conditional):
 *   VAR.name                value of the field, '' when unset
 *   (... VAR.name ...)      whole group dropped when the field is unset/false
 *   a + b                   joins words without a space ("2d + dp" → "2ddp")
 *   [name ? [text]]         text when the field is set or the job type is `name`
 *   [name ? a : b]          a or b, same test
 */

export type JobArgs = Record<string, any>;

export interface AppTemplate {
  fields?: Record<string, TemplateField>;
  parameters?: {
    default?: Record<string, unknown>;
    mainCommand?: string;
    prologueCommands?: string | string[];
    epilogueCommands?: string | string[];
    options?: { allowWriteScript?: boolean; [k: string]: unknown };
    [k: string]: unknown;
  };
  force?: Record<string, string>;
}

export interface TemplateField {
  type: 'radioButtons' | 'checkbox' | 'checkBoxes' | 'textField' | 'file' | string;
  label?: string;
  sublabel?: string;
  caption?: string;
  required?: boolean;
  /** radioButtons */
  radios?: Record<string, { caption: string; value: string }>;
  /** checkBoxes */
  checks?: Record<string, { caption: string; value: string }>;
  /** checkbox: string sent for checked / unchecked */
  value?: { true?: string; false?: string };
  /** Condition; the field is ignored while it holds. */
  disabled?: string | boolean;
  /** textField: an enable toggle stored as use<Field>. file: same, via `switch`. */
  checkbox?: boolean;
  switch?: boolean;
  multiple?: boolean;
  pattern?: string;
  clear?: string;
}

const truthy = (v: unknown) => v !== undefined && v !== null && v !== false && v !== '' && !(Array.isArray(v) && v.length === 0);
const str = (v: unknown) => (Array.isArray(v) ? v.join(',') : v === undefined || v === null || v === false ? '' : String(v));

function isSet(name: string, args: JobArgs): boolean {
  return truthy(args[name]) || args.type === name;
}

const BRACKET = /\[\s*([A-Za-z_]\w*)\s*\?\s*(?:\[([^\]]*)\]|([^:\]]*?))\s*(?::\s*([^\]]*?))?\s*\]/g;
const GROUP = /\(([^()]*?VAR\.([A-Za-z_]\w*)[^()]*?)\)/g;
const VAR = /VAR\.([A-Za-z_]\w*)/g;

/** Expand one template string (or lines) against job args. */
export function expand(template: string | string[] | undefined, args: JobArgs, singleLine = false): string {
  if (template === undefined || template === null) return '';
  const text = Array.isArray(template) ? template.join('\n') : String(template);
  return text
    .replace(BRACKET, (_m, name, nested, a, b) => (isSet(name, args) ? (nested ?? a ?? '') : (b ?? '')).trim())
    .replace(GROUP, (_m, inner: string, name: string) => (truthy(args[name]) ? inner : ''))
    .replace(VAR, (_m, name: string) => str(args[name]))
    .replace(/\s\+\s/g, '')
    .replace(singleLine ? /\s+/g : /[ \t]+/g, ' ')
    .trim();
}

/**
 * Evaluate a template condition: true/false, "[name ? a : b]", or
 * "field==value" / "field!='value'" (also <, >, <=, >=).
 */
export function evalCondition(cond: string | boolean | undefined, args: JobArgs): boolean {
  if (typeof cond === 'boolean') return cond;
  if (!cond) return false;
  const c = cond.trim();
  if (c.startsWith('[')) return expand(c, args) === 'true';
  const m = c.match(/^([A-Za-z_]\w*)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
  if (!m) return false;
  const [, field, op, raw] = m;
  const quoted = raw.trim().match(/^['"](.*)['"]$/);
  const word = raw.trim();
  let rhs: unknown = quoted ? quoted[1] : /^-?\d+(\.\d+)?$/.test(word) ? Number(word) : args[word];
  if (rhs === 'true') rhs = true;
  if (rhs === 'false') rhs = false;
  const lhs = args[field] ?? '';
  switch (op) {
    case '==': return lhs == rhs; // eslint-disable-line eqeqeq -- template values mix strings and numbers
    case '!=': return lhs != rhs; // eslint-disable-line eqeqeq
    case '<': return Number(lhs) < Number(rhs);
    case '>': return Number(lhs) > Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
  }
  return false;
}

/**
 * Turn submitted form values into the job args the schedulers expect:
 * template defaults for missing values, checkbox strings, disabled fields
 * removed, input file name, and the expanded commands. Mutates and returns args.
 */
export function applyTemplate(form: AppTemplate, args: JobArgs): JobArgs {
  const params = form.parameters ?? {};
  const defaults = params.default ?? {};

  // 1. Plain defaults first, so fields and expressions below can see them.
  for (const [k, v] of Object.entries(defaults)) {
    if (args[k] === undefined && !(typeof v === 'string' && /VAR\.|\[/.test(v))) {
      args[k] = Array.isArray(v) ? v.join('\n') : v;
    }
  }

  // 2. Fields: drop disabled ones, map checkbox booleans to their strings.
  for (const [id, field] of Object.entries(form.fields ?? {})) {
    if (evalCondition(field.disabled, args)) {
      delete args[id];
      continue;
    }
    if (field.type === 'checkbox' && field.value) {
      const on = args[id] === true || args[id] === 'true';
      args[id] = (on ? field.value.true : field.value.false) ?? '';
    }
    if ((field.type === 'textField' && field.checkbox) || (field.type === 'file' && field.switch)) {
      if (args[`use${id}`] === false) delete args[id];
    }
  }

  // 3. Binary from the chosen version (never trust a client-sent path; v1 default: last version).
  const binaries = params.appBinaries as Record<string, string> | undefined;
  if (binaries && Object.keys(binaries).length) {
    const versions = Object.keys(binaries);
    const version = versions.includes(args.version) ? args.version : versions[versions.length - 1];
    args.version = version;
    args.appBinaries = binaries[version];
  } else if (params.mainCommand?.includes('VAR.appBinaries')) {
    throw new Error('No installed version of this application is configured (parameters.appBinaries). Ask an administrator to add one under Admin → Applications.');
  } else {
    delete args.appBinaries;
  }

  // 4. Scheduler resources.
  if (args.numProcs === undefined && args.procs !== undefined) args.numProcs = Number(args.procs);

  // 5. Input file name for the command line.
  const uploaded = args['inputFile[]'];
  if (args.useinputFile && !args.inputFileName && typeof uploaded === 'string') {
    args.inputFileName = uploaded.split('/').pop();
  }

  // 6. Expression defaults (e.g. "[batch ? [-g]]"), then the commands.
  for (const [k, v] of Object.entries(defaults)) {
    if (args[k] === undefined && typeof v === 'string') args[k] = expand(v, args, true);
  }
  args.mainCommand = expand(params.mainCommand, args, true);
  args.prologueCommands = expand(params.prologueCommands, args);
  args.epilogueCommands = expand(params.epilogueCommands, args);
  return args;
}
