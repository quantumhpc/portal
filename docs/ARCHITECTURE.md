# Architecture

The portal is a single Next.js (App Router) application. The browser talks
to API routes, and those routes run scheduler commands and file operations
**as the logged-in user**.

```
app/
  login/                     sign-in page
  (authenticated)/           every page behind login (dashboard, jobs, job/[id],
                             compute, interactive, storage, cluster, licensing,
                             admin, profile)
  api/                       route handlers
    auth/[...nextauth]       NextAuth credentials provider → PAM
    manager/{jobs,nodes,queues,submit}   scheduler operations
    data/{tree,resource,tus,download,operations}   file manager (tus = resumable uploads)
    jobs/, alerts/, info/, profile/, license/ (license-server usage)
    saved-runs/              named job-form set-ups of the logged-in user
    admin/{users,apps,parsers,config,health}    admin-only; apps and parsers write the site folder
    dev/mock                 switches mock scenarios (development only)
components/                  React components (shadcn/ui primitives in ui/)
hooks/                       TanStack Query hooks for the API
lib/
  config.ts                  loads $QHPC_CONFIG_DIR/config.json + env overrides
  auth/                      NextAuth options, PAM, per-user HPC config
  hpc/
    exec.ts                  runs a command locally or over SSH as the user
                             (uid/gid switch, sanitised environment)
    slurm/, pbs/             scheduler backends: build commands, parse output
    formatter.ts             normalise scheduler fields to a common model
    managers.ts              job submission, templates, remote sessions
  files/                     file-manager operations
  license-managers/          FlexLM / RLM / LM-X status parsers
  apps.ts, apps-admin.ts     application list and forms: shipped apps/ + site $QHPC_CONFIG_DIR/apps
  parsers/                   progress-chart parsers: built-ins, regex recipes (recipe.ts),
                             site recipes and JS drop-ins (site.ts), resolver (index.ts)
  db/                        MongoDB client or the SQLite shim with the same API
apps/                        shipped application templates, logos and remote-desktop scripts
config/                      config.example.json, config.dev.json, managers/*.json
deploy/                      installer, systemd, PAM and nginx templates
dev/                         mock schedulers, scenarios, dev seed script
instrumentation*.ts          production startup checks
middleware.ts                redirects unauthenticated requests to /login
```

## Request flow: listing jobs

1. The browser calls `GET /api/manager/jobs` through a hook in `hooks/use-jobs.ts`.
2. The route reads the NextAuth session and gets the user's uid/gid/home
   (resolved through `getent` at login).
3. `lib/auth/hpc-config.ts` merges the site scheduler config with the user's identity.
4. `lib/hpc/slurm` builds the `squeue` command, and `lib/hpc/exec.ts` runs it
   with the user's uid/gid and environment.
5. The output is parsed, normalised by `formatter.ts` and returned as JSON.

## Adding a scheduler backend

Create `lib/hpc/<name>/index.ts` exposing the same functions as
`lib/hpc/slurm/index.ts` (jobs, nodes, queues, submit, cancel, …). Wire it in
`lib/hpc/managers.ts`, add a mock under `dev/<name>-mock/` driven by
`dev/mock-scenarios/*.json`, and add parser tests.

## Database

`lib/db/connection.ts` returns either a MongoDB `Db` or the SQLite shim
(`lib/db/sqlite-driver.ts`). The shim implements the subset of the MongoDB
driver API the code uses, storing each collection as a table of JSON
documents. Code should only use that subset (see the header of
`sqlite-driver.ts`) so both drivers keep working.
