# Agent instructions

QuantumHPC Portal is one Next.js (App Router) application. API routes run
scheduler commands and file operations **as the logged-in OS user**.
Read the folder map in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.
This file says where a change belongs, what must not break, and how to check it.

## Where to make a change

| Task | Files |
| --- | --- |
| Scheduler commands, output parsing | `lib/hpc/slurm/`, `lib/hpc/pbs/` (each has a `json.ts` for JSON output); mocks in `dev/slurm-mock/`, `dev/pbs-mock/` |
| Job fields shown in the UI | `lib/hpc/formatter.ts` (code tables and reverse map). Components read only the normalised names: `jobId`, `name`, `username`, `status`, `queue`, `procs`, `elapsedtime`, `walltime` |
| Job submission, job scripts, DB-to-queue sync | `lib/hpc/managers.ts` (`submitJob`, `compareJobInfo`), `lib/hpc/job-template.ts` |
| Portal job records | `lib/db/jobs.ts`: what the portal knows about a job (app, inputs, parsed progress), joined to the live queue on job id |
| Applications and job forms | `lib/apps.ts`, `lib/apps-admin.ts`; shipped templates in `apps/`, site templates in `$QHPC_CONFIG_DIR/apps/` |
| Progress parsers | `lib/parsers/` (built-ins in `index.ts`, regex recipes in `recipe.ts`, site files in `site.ts`); `docs/PARSERS.md` |
| Config keys | `lib/config.ts`, `config/config.example.json`, `docs/CONFIGURATION.md` |
| File manager | `lib/files/`, `app/api/data/` |
| Pages, components, data hooks | `app/(authenticated)/`, `components/<area>/`, `hooks/use-*.ts` |
| Install and production | `deploy/`, `docs/INSTALL.md` |
| Dev environments | `dev/README.md`, `dev/slurm-cluster.sh`, `docker-compose.slurm.yml` |

## Rules that must hold

- File and scheduler actions for a user go through `lib/files/as-user.ts` or
  `lib/hpc/exec.ts` with that user's uid/gid. Never act as the portal process:
  it would bypass OS permissions.
- DB code uses only the MongoDB subset that `lib/db/sqlite-driver.ts`
  implements, so MongoDB and SQLite both keep working.
- Schedulers reuse job ids. Update a job record by `_id`, and treat records in
  `Archive` status as history, never as the live job.
- Admin pages never edit shipped `apps/`. They write drop-ins (`95-admin.json`)
  or site files under `$QHPC_CONFIG_DIR`.
- Config changes apply without a restart, except the keys in `RESTART_KEYS`
  (`lib/config.ts`).
- Mocks print exactly what the real scheduler prints. A fix that only makes the
  mock pass can hide a real bug: check output changes on the Slurm dev cluster.
- JS parser files are placed on disk by an administrator and must be owned by
  the portal user. Never add a way to upload code through the browser.

## Check before you finish

```bash
npm run typecheck
npm test
npm run lint                      # 0 errors
```

Scheduler or job-flow changes: also run `dev/slurm-cluster.sh up`, then
`dev/slurm-cluster.sh test` (real Slurm in containers, about 4 GB of disk).
Shell scripts: `shellcheck -S warning <file>`.

## Ignore

`v1/` (legacy, not tracked), `node_modules/`, `.next/`, `dev/qhpc.sqlite*`,
and the local `config/config.json`.

## Conventions

- Commit subjects follow Conventional Commits; sign off with `git commit -s` (DCO).
- Add user-visible changes to `CHANGELOG.md` under *Unreleased*.
- Write code comments and docs in plain, short sentences.
