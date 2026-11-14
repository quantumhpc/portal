# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

First open-source release.

### Added
- Logo (`public/logos/`) in the sidebar, login page and favicon, and a colour theme built from it: soft grey in light mode, deep blue-grey in dark mode, status and chart colours from the theme.
- Admin → Health: checks sign-in, the scheduler, storage, the database and the site configuration, with a fix for each problem, and a support bundle download with secrets removed.
- OpenFOAM application: upload the case as an archive (.tar.gz, .tgz or .tar), pick icoFoam, pisoFoam, pimpleFoam or simpleFoam, and optionally run blockMesh first. It uses the openfoam.com v2512 packages by default (`/usr/lib/openfoam/openfoam2512/etc/bashrc`); change the path under Admin → Applications → Parameters.
- Job page: the status follows the queue while the job runs and shows "Finished" once it has left the queue, instead of staying on the status it had when the page opened.
- Admin → Applications → Fields: "Add to form" replaces the blank field-key box. Pick from ready-made additions (time limit, memory, nodes, tasks, GPUs, scratch disk, whole nodes, account, QOS, node features, reservation, node lists, job arrays, dependencies, start time, email notifications, output file, extra files, modules, Conda, OpenMP threads, scratch folder, extra arguments, precision, dimension, MPI library), or describe your own flag, choice, text or file with a name and its command-line text. Each one is connected to the job on insert, and every field card says how it is used.
- Job forms: the time limit, email address and output file name are checked before submit (whole numbers, minutes 0-59, a real address, a plain file name). Memory per node and memory per core together are refused, PBS memory is checked like Slurm, and Slurm node features accept `&` and `|`.
- Slurm GPUs: 0 in the GPUs field now means no GPU, and a GPU type with a colon (for example `a100:2`) is refused with a clear message instead of producing an invalid `--gres`.
- Slurm: job forms can now set nodes, tasks, tasks per node, memory per core, GPU count, scratch disk, account, QOS, node features, reservation, node lists, job arrays, dependencies and start time. Values are checked before they reach the job script.
- Look and wording: job status colours (running green, held amber, failed red), a readable amber for warning text, a cluster pill that reports "degraded" from 10% of cores down and says "Cluster available" instead of "Cluster idle", sentence-case labels, clearer sign-in text with one message for any failed sign-in, a rocket icon for Start a job, Profile only in the user menu, loading placeholders instead of spinners, larger dashboard card titles, and a search box on My submissions.
- Phones and narrow windows: the navigation opens as a drawer from the menu button instead of taking a third of the screen, the cluster status shows as a dot, and page padding is smaller. The collapsed sidebar on wider screens is remembered across reloads.
- Job form: the input file comes first and can be dropped on the box. A missing required field is marked under the field and scrolled into view. Submitting with no input file asks first, unless the application needs none. New jobs are named after the application plus the date and time. The Default queue shows its name when the scheduler reports it. The Submit button stays visible at the bottom, and a submitted job opens on its own page.
- Dashboard: a "Start a job" button, and the jobs card lists only your own queued and running jobs, each linking to its job page. The cluster card shows free cores with a usage bar. Licence bars turn yellow from 80% used and red from 95%. Panels can no longer be dragged to reorder.
- Cancel a job from My submissions and from the job page. Cancel now asks first, and is offered only on your own queued or running jobs (admins: all jobs). The job page shows the job name and status. "Remove from the list" has its own icon.
- Run again and saved set-ups: start a past job again from a pre-filled form, or save the form values under a name and start them from the Start a job page.
- MIT license, contribution guide, code of conduct and security policy.
- `deploy/install.sh` cluster installer, plus systemd, PAM and nginx templates.
- `docs/INSTALL.md`, `docs/CONFIGURATION.md` and `docs/ARCHITECTURE.md`.
- `QHPC_CONFIG_DIR` to keep site configuration outside the application tree.
- Startup check that refuses to run in production without a strong `NEXTAUTH_SECRET`.
- Admin → Applications: create applications (blank or as a copy), edit name,
  description, tags and logo, hide them from users, delete or reset them, and
  export/import them as one `qhpc-app/1` JSON file.
- Progress-chart parsers per application: built-in, pattern recipes built and
  tested in the browser, or JavaScript files placed on the server
  (`docs/PARSERS.md`). Job pages show parser messages and summary values.
- Site folder `$QHPC_CONFIG_DIR/apps/` for admin-made applications, logos and
  parsers, kept across upgrades.
- Cluster page with Nodes and Queues tabs, node-state icons and a table view.
- `docs/ADD-AN-APP.md` and `docs/PARSERS.md`.
- Dev environment on a real Slurm cluster in containers
  (`docker-compose.slurm.yml`, `dev/slurm-cluster.sh`, based on
  giovtorres/slurm-docker-cluster): controller, two compute nodes, accounting,
  and the portal itself with hot reload and real PAM logins. Works with Docker
  or rootless podman.

### Changed
- `use_pam` now defaults to `true`.
- `db.driver` and `db.file` in `config.json` are honoured (previously env-only).
- Fonts are bundled, so builds no longer need access to Google Fonts.
- Configuration saved in Admin → Configuration, or edited in `config.json`,
  applies on the next request without a restart (except `port`, `https`,
  `ssl_*`, `tmpdir` and `db.*`). `admin_users` also applies to users who
  already logged in.
- Application edits apply immediately and are written to the site folder
  instead of `apps/templates/**/95-admin.json`.
- The Workload Manager page is merged into the Cluster page (`/manager`
  redirects there).
- Jobs page opens on "My submissions", with application names and logos.

### Removed
- Commercial license-file / seat-token gate.
- Legacy v1 application.
- Unused WinHPC template fragments and the old `apps/parsers/*.js` copies.

### Fixed
- OpenFOAM progress charts: transient solvers print fractional times ("Time = 0.005"), which were read as whole numbers, so every point landed on the same x.
- Progress charts no longer plot a point from a line the solver is still writing.
- A submitted job whose uploaded input file could not be moved into the job folder now says so, instead of failing later with "cp: cannot stat".
- No more hydration error on every page (the mobile navigation drawer shifted the user menu's generated ids).
- Slurm: a job with a time limit was written as `--time=walltime=H:M:00`, which sbatch rejects. It is now `--time=H:MM:00`.
- The Geist font was never applied (pages used the system font).
- Dark mode: the theme button caused a hydration error on every page load.
- File manager: the sidebar link pointed to an unknown folder, so the tree
  never loaded; the base folder is now always shown and selected, so you can
  create a folder in an empty home.
- Compute page shows application names and logos (it showed internal ids).
- Admin form editor saved tick-box options under the wrong key.
- Progress charts: series with different x values are aligned, name-keyed
  results (OpenFOAM, Abaqus) are drawn, and log-valued residuals no longer
  break the axis.
- `memory` and `memory_default` in `config.json` had no effect.
- Dashboard hydration error from the drag-and-drop panel grid.
- Slurm job submission returned "Submitted batch job N" as the job id; the
  portal now runs `sbatch --parsable`.
- Slurm nodes with some cores in use (MIXED) were shown as fully busy.
- On Slurm, the Cluster page showed 0 running jobs and no jobs per node; they now come from `squeue`.
- Job owner showed an internal user id on the job page and was blank in the jobs table; both now show the username.
- Jobs page: "All cluster jobs" showed no name, cores or elapsed time (Slurm and PBS), and "My submissions" showed only the status last saved in the database. Each tab now joins the live queue with the portal's job records: queue rows show the application of jobs started from the portal, portal jobs show live status, elapsed time and cores. Both lists refresh every 15 s.
- A job id reused by the scheduler left the older portal record stuck at "New"; the older record is now archived and updates no longer hit the wrong record.

### Security
- Commands run on behalf of users no longer inherit the portal's secrets
  (e.g. `NEXTAUTH_SECRET`), and they get the user's `HOME`/`USER`/`LOGNAME`.
