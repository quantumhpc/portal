# Application gallery

Ready-made applications that any site can load with
**Admin → Applications → Import**. Each file is one `qhpc-app/1` bundle: the
details, the job form and the progress-chart recipe, without the logo.

| File | Application | Notes |
| --- | --- | --- |
| [`demo-residual_demo.qhpc-app.json`](demo-residual_demo.qhpc-app.json) | Residual demo | Prints decaying residuals; used by the demo image. A short example of a form plus a recipe. |

## After you import

Check the **Parameters** tab before users submit: the binary paths and
`module load` lines in a bundle come from the site that made it. Change them
to match your cluster.

## Add your application

No code needed. Add a solver your site runs, so the next site doesn't have to:

1. Build and test it on your portal, as in [Add an application](../docs/ADD-AN-APP.md).
   Use a **pattern recipe** for the progress chart, since JavaScript parsers are not
   included in bundles.
2. Click **Export** on the Details tab.
3. Name the file `<category>-<id>.qhpc-app.json`, put it in this folder, and
   add a row to the table above.
4. Replace site-specific paths with an obvious placeholder, for example
   `/path/to/solver/bin/solver`, and remove anything private (hostnames,
   accounts, license servers).
5. Open a pull request, signed off (`git commit -s`).
