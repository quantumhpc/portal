# Add an application in five minutes

Everything here happens in the browser, as a portal admin, under
**Admin → Applications**. Each step applies as soon as you save: users see
the change on their next page load, with no restart.

As an example, we add an in-house solver, `mysolver`, that reads an input
deck and writes residuals to `output.log`.

## 1. Create the application

Click **New**, then fill in:

- **Name**: what users see, e.g. *My Solver 2025*.
- **Category**: groups applications on the Compute page, e.g. `cfd`.
- **Id**: filled in from the name. It appears in URLs and file names.
- **Start from**: an empty form, or a copy of an existing application.
  Copying is the fastest way to add a new version or variant of a solver.

The application opens in the editor and already appears on the Compute page.

## 2. Details

On the **Details** tab, add a description and tags, upload a logo (PNG,
JPEG or WebP, up to 512 KB), and choose how users run it: as a batch job, as
a remote desktop, or both.

**Hide from users** keeps an application configured but off the Compute
page, for example while you test it.

## 3. Fields

The **Fields** tab defines the form users fill in. Add a field by its key
(the name you use in the command), then choose its type:

| Type | Use it for |
| --- | --- |
| Text | Free text, numbers, file names |
| Choice (one of) | Solver, precision, 2D/3D |
| Tick boxes (several) | Optional steps, e.g. mesh and solve |
| Yes / no | A flag; you set the value sent for each answer |
| File | An input file the user uploads with the job |

Use the arrows to reorder fields and the copy button to duplicate one.

## 4. Parameters

The **Parameters** tab holds what the user does not type:

- **Main command**, built from `VAR.<field>` placeholders:

  ```
  VAR.appBinaries -i "VAR.inputFile" -np VAR.numProcs (> VAR.outputFile 2>&1)
  ```

  `VAR.appBinaries` is the executable for the version the user picks.
  Text in `( )` is dropped when the variable inside it is empty.
- **Application binaries**: one entry per version, e.g.
  `v2025` → `/apps/mysolver/2025/bin/mysolver`. A `*` in the path picks the
  newest match.
- **Default values** for fields.
- **Prologue commands**, e.g. `module load mysolver`.

Check the **Preview** tab, then **Save form**.

## 5. Progress chart

On the **Parser** tab, choose **Pattern recipe (no code)**. Each pattern is
a regular expression matched against every line of the job output:

| Setting | Example | Effect |
| --- | --- | --- |
| Iteration line | `^Iter ([0-9]+)` | Sets the x value |
| Series | `res\[(\w+)\] = ([0-9.eE+-]+)`, label `$1`, value `2` | One line per variable |
| Summary value | `Wall time: ([0-9.]+)` | A tile above the chart |
| Finished / Failed | `^Done$` / `ERROR` | A banner on the job page |

Paste a few hundred lines of a real log (or give the path of one on the
cluster) and click **Run test**. Matching lines are highlighted and the
chart is drawn exactly as users will see it. Then **Save parser**.

Solvers with unusual output can use a JavaScript parser instead: see
[PARSERS.md](PARSERS.md).

## 6. Submit a test job

Open the application on the Compute page, submit a short case, and open
the job: the **Progress** tab shows the chart while the job runs.

## Share it

**Export** on the Details tab downloads one `.qhpc-app.json` file: details,
form and parser recipe (not the logo). Another site loads it with
**Import**. Global defaults such as the output file name are not included;
the importing site applies its own.

To share it with every site, add the file to the
[application gallery](https://github.com/quantumhpc/portal/tree/main/gallery).

## Where it is stored

All of this lives in the site folder, `$QHPC_CONFIG_DIR/apps/`
(`/etc/qhpc-portal/apps/` with the installer), never in the application
tree, so upgrades keep it:

```
apps/
  applist.json                 details, visibility and parser choice
  templates/<category>/<id>.json        base form of applications added here
  templates/<category>/<id>.d/95-admin.json   form edits
  img/                         uploaded logos
  parsers/<id>.json            pattern recipes
```

**Reset to shipped defaults** (for shipped applications) or **Delete
application** (for ones added here) removes the matching files.
