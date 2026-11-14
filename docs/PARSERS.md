# Progress-chart parsers

A parser reads a job's output file and returns the data for the **Progress**
tab of the job page: chart series, summary values and a status banner.
Choose one per application under **Admin → Applications → Parser**:

| Source | Defined | Runs |
| --- | --- | --- |
| Built-in | `lib/parsers/*.ts` (Fluent, CFX, Mechanical, Abaqus, OptiStruct, STAR-CCM+, OpenFOAM) | Shipped code |
| Pattern recipe | In the browser, stored as `$QHPC_CONFIG_DIR/apps/parsers/<id>.json` | Regular expressions only, no code |
| JavaScript file | Placed on the server as `$QHPC_CONFIG_DIR/apps/parsers/<id>.js` | Code inside the portal process |
| None | | No Progress tab |

Applications with no setting use the built-in parser with the same name, if
there is one.

## Pattern recipes

Prefer a recipe whenever the output is line-based. It needs no code, so any
portal admin can write one safely, and the editor tests it on a real log
before you save. The step-by-step guide is in
[ADD-AN-APP.md](ADD-AN-APP.md#5-progress-chart). The stored format:

```json
{
  "file": "outputFile",
  "logScale": true,
  "iteration": { "pattern": "^Time = ([0-9.]+)" },
  "series": [
    {
      "pattern": "Solving for (\\w+), Initial residual = ([0-9.eE+-]+)",
      "label": "$1",
      "value": 2,
      "firstPerIteration": true
    }
  ],
  "outputs": [
    { "label": "Run time (s)", "pattern": "ExecutionTime = ([0-9.]+)", "type": "Number" }
  ],
  "end": { "success": "^End$", "error": "FOAM FATAL ERROR" }
}
```

- `iteration` sets the x value for the points that follow. Without it,
  points are numbered 1, 2, 3… per series.
- `label` may use `$1`…`$9` from the series pattern.
- `value` is the capture group holding the number (default 1).
- `firstPerIteration` keeps one point per iteration and label (useful when a
  solver prints several corrector steps).
- `logScale` plots log10 of the values, for residuals. Values ≤ 0 are skipped.
- `outputs`: the last match wins.
- `end.error` shows the matching line in a red banner.

Limits: 20 patterns per recipe, and lines are cut to 2,000 characters
before matching.

## JavaScript files

For output a recipe can't describe: multi-line blocks, tables, values
that need arithmetic, or a second file. A JavaScript parser is code that
runs **inside the portal process, which runs as root in production**, so:

- it is never uploaded through the browser;
- it loads only if the file **and** the `parsers/` folder are owned by the
  user the portal runs as and are not writable by group or others. The
  admin page shows why a file is refused.

Install one as root:

```bash
install -o root -g root -m 0644 mysolver.js /etc/qhpc-portal/apps/parsers/mysolver.js
```

It is picked up on the next request (no restart), and reloaded when the
file changes. Then select it under **Parser → JavaScript file on the
server**.

The file is CommonJS. `post` follows `ParserFn` in
[`lib/parsers/types.ts`](../lib/parsers/types.ts):

```js
// mysolver.js: one series per "res[<name>] = <value>" line, x from "Iter <n>"
module.exports = {
  require: "outputFile", // or "historyFile"

  post(outputFile, startLine, startIter, preData, next) {
    const lines = outputFile.split("\n");
    const series = {};
    let iter = Number(startIter) || 0;

    for (let i = Number(startLine) || 0; i < lines.length; i++) {
      const it = lines[i].match(/^Iter (\d+)/);
      if (it) { iter = Number(it[1]); continue; }
      const m = lines[i].match(/res\[(\w+)\] = ([0-9.eE+-]+)/);
      if (m) (series[m[1]] ||= { label: m[1], data: [] }).data.push([iter, Math.log10(Number(m[2]))]);
    }

    next(null, {
      graph: Object.values(series),
      markings: [],
      step: { lastLine: lines.length, lastIter: iter },
      custom: { outputs: { iters: { label: "Iterations", value: iter, type: "Number" } } },
    });
  },
};
```

`require()` inside the file resolves from the file's own folder. Test it with
**Run test** on the Parser tab before selecting it.

## Built-in parsers

New built-in parsers are welcome as pull requests: add
`lib/parsers/<app>.ts`, register it in `lib/parsers/index.ts`, and add a test
with a short anonymised log under `lib/parsers/__tests__/`.
