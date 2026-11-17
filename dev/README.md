# Dev environment

This folder contains everything you need to run the portal end-to-end against
mock HPC schedulers — no real cluster, optionally no Docker.

## Quick start

```bash
./dev/start-dev.sh                 # sqlite + slurm mocks (default)
./dev/start-dev.sh --mode mongo    # boots a MongoDB container instead

DB_DRIVER=sqlite npm run dev       # boot the app
```

Login with your OS username and password — the portal uses PAM authentication.
In dev mode (`use_pam: false` in `config/config.json`) the password field is
ignored and any valid OS user is accepted.  The seed script pre-authorises your
current user as admin in the SQLite store.

## Real Slurm cluster in containers

For work that needs a real scheduler (job states, accounting, output written
by compute nodes, PAM logins), run a Slurm cluster and the portal in
containers. It is based on
[giovtorres/slurm-docker-cluster](https://github.com/giovtorres/slurm-docker-cluster)
and works with Docker or rootless podman.

```bash
dev/slurm-cluster.sh up       # or: npm run dev:cluster
```

The first start pulls the Slurm image and runs `npm ci` inside the portal
container, which takes a few minutes. Then open <http://localhost:3080>:

| Login | Password | Role |
| --- | --- | --- |
| `alice` | `password` | portal admin |
| `bob` | `password` | user |
| `ood` | `password` | user |

**Start a job → Residual demo** submits a short job whose output draws a
live Progress chart, so you can watch jobs run on the nodes without a
commercial solver.

| Service | What it is |
| --- | --- |
| `slurmctld`, `slurmdbd`, `mysql` | controller, accounting and its database |
| `cpu-worker` ×2 | compute nodes `c1`, `c2` (`CPU_WORKER_COUNT` to change) |
| `portal` | `next dev` on the bind-mounted source, hot reload, real PAM |

| Command | Does |
| --- | --- |
| `dev/slurm-cluster.sh status` | `sinfo` and `squeue` |
| `dev/slurm-cluster.sh shell [service]` | shell in `slurmctld` (default) or a service, e.g. `sbatch`, `sacct` |
| `dev/slurm-cluster.sh logs [service]` | follow logs |
| `dev/slurm-cluster.sh test` | smoke test: PAM login, submit, progress, user isolation |
| `dev/slurm-cluster.sh cavity-case [cells] [file]` | OpenFOAM lid-driven cavity case as a `.tar.gz` (default 160×160 cells, `./cavity.tar.gz`) |
| `dev/slurm-cluster.sh cavity [cells]` | upload that case as alice, run it with the OpenFOAM app, wait, check the residuals |
| `dev/slurm-cluster.sh down` | stop, keep data |
| `dev/slurm-cluster.sh clean` | stop and delete every volume |

### OpenFOAM

The cluster image can include OpenFOAM (openfoam.com release, v2512, about
840 MB) for a real solver run. It is off by default:

```bash
WITH_OPENFOAM=1 dev/slurm-cluster.sh up      # rebuild the image with OpenFOAM
dev/slurm-cluster.sh cavity                  # about 2 to 3 minutes
```

`cavity` copies the icoFoam lid-driven cavity tutorial from the installed
OpenFOAM, refines the mesh (160×160 cells instead of 20×20) and shortens the
time step to keep the same Courant number, so the run lasts long enough to
watch. It then uploads the case, submits it through the portal API with the
shipped OpenFOAM application, and checks that the job page gets Ux, Uy and p
residuals for all 800 time steps. The command prints the job page URL.

To start it by hand: `dev/slurm-cluster.sh cavity-case 160 cavity.tar.gz`,
then **Start a job → OpenFOAM**, attach `cavity.tar.gz` and submit. The case
files come from the OpenFOAM install, not from this repository.

Where things live (named volumes, shared by the nodes and the portal):

- `/home`: user homes, including `~/jobs` written by the portal.
- `/scratch`: job working directories (mode 1777).
- `/etc/qhpc-portal` (portal only): the site config, seeded on first start
  from `dev/docker/slurm/site/`. Admin → Applications and Configuration edits
  persist here. `clean` resets it.
- `/var/lib/qhpc` (portal only): the SQLite database.

Notes:

- The portal listens on 3080 (`PORTAL_PORT`), so `npm run dev` on the host
  can run at the same time. `node_modules` and `.next` are container volumes,
  separate from the host's.
- `USE_PAM=false dev/slurm-cluster.sh up` accepts any password, as the host
  dev mode does.
- With podman, the script starts the user `podman.socket` if it isn't
  running. Compute nodes run `privileged`, as upstream does.
- If a change to `app/globals.css` doesn't show up, even after a restart,
  Turbopack's dev cache is stale. Clear it and restart the portal:
  `podman exec qhpc-slurm-portal-1 rm -rf /app/.next/dev/cache && podman restart qhpc-slurm-portal-1`
  (use `docker` instead of `podman` with Docker).

## Switching schedulers (Phase C)

The portal is driven by two env vars:

| Env var               | What it controls                                      | Values                          |
| --------------------- | ----------------------------------------------------- | ------------------------------- |
| `HPC_MANAGER`         | Which scheduler the portal talks to                   | `slurm` (default), `pbs`        |
| `QHPC_MOCK_SCENARIO`  | Which mock cluster topology the binaries respond with | `default`, `busy`, or `<path>`  |

Both mocks share the same scenario format under `dev/mock-scenarios/*.json`,
so flipping `HPC_MANAGER=pbs` against the same UI is a one-env-var change.

State lives under `/tmp/qhpc-mock/<manager>/` (override via
`QHPC_MOCK_STATE_ROOT`). First invocation per scenario seeds the
`preSeededJobs` from the scenario file.

`QHPC_MOCK_RUN=1` makes the Slurm mock run each job script in the background,
as the submitting user, with output to the `--output` file (default
`slurm-<id>.out`). The job then ends as `COMPLETED` or `FAILED`, and `scancel`
stops it. The mock prints the same thing either way. The demo image
(`deploy/demo/Dockerfile`) turns it on.

## Config presets

`config/managers/` ships with two local presets used by the mocks:

- `slurm_config.local.json` — `method: "local"`, points at `dev/slurm-mock`
- `pbs_config.local.json`   — `method: "local"`, points at `dev/pbs-mock`

Point the runtime at one with the env var the loader reads
(`slurm_config` / `pbs_config`):

```bash
HPC_MANAGER=slurm slurm_config=$PWD/config/managers/slurm_config.local.json npm run dev
HPC_MANAGER=pbs   pbs_config=$PWD/config/managers/pbs_config.local.json    npm run dev
```

(The seed script wires the user's per-scheduler config to the same paths, so
you usually don't need this.)

## Mocks

```
dev/
  slurm-mock/    sbatch  squeue  scontrol  scancel
  pbs-mock/      qsub    qstat   qdel  pbsnodes  qhold  qrls  qrun  qrerun
                 qmove   qalter  qmgr
  mock-bin/      lib.mjs              (shared scenario + state I/O)
  mock-scenarios/
    default.json  three-node cluster, no jobs
    busy.json     three-node cluster, three pre-seeded jobs (CFD/FEA mix)
```

Every mock binary is a Node ESM script (`#!/usr/bin/env node`) that imports
`mock-bin/lib.mjs`. Adding a new scenario is just dropping a JSON file in
`mock-scenarios/`.

## Switching scenarios at runtime

A dev-only admin route swaps scenarios without restarting the app:

```bash
# list available scenarios
curl -b "$COOKIE" http://localhost:3000/api/dev/mock

# switch
curl -b "$COOKIE" -X POST http://localhost:3000/api/dev/mock \
  -H 'content-type: application/json' \
  -d '{"scenario":"busy"}'
```

POST also wipes `/tmp/qhpc-mock/` so the new scenario re-seeds. The route
returns 404 outside `NODE_ENV=development`.

## Modes (`dev/start-dev.sh`)

| Mode      | Storage                  | Scheduler                              | External deps |
| --------- | ------------------------ | -------------------------------------- | ------------- |
| `sqlite`  | `dev/qhpc.sqlite`        | local mock binaries                    | none          |
| `ssh`     | `dev/qhpc.sqlite`        | `qhpc-hpc-mock` container, ssh :2222   | docker        |
| `mongo`   | `qhpc-mongo` container   | local mock binaries                    | docker        |
| `slurm-cluster` (`dev/slurm-cluster.sh`) | SQLite in the portal container | real Slurm, 2 compute nodes | docker or podman |

The script writes `.env.local` and seeds an admin user wired to the right
scheduler config (local for sqlite/mongo, `method: "ssh"` + `dev/keys/id_rsa`
for ssh).

### SSH mode details

`--mode ssh` builds `dev/docker/hpc-mock/Dockerfile` (debian-slim + sshd +
node + the same Phase-C mock binaries), exposes sshd on `localhost:2222`, and
generates `dev/keys/{id_rsa,id_rsa.pub,authorized_keys}` on first run. The
mock binaries inside the container live at `/opt/qhpc-mock/{slurm,pbs}-mock`,
sharing the scenario JSON via `QHPC_MOCK_SCENARIO_DIR` baked into the image.

To exercise PBS over SSH, point the user's `pbs_config` at
`config/managers/pbs_config.ssh-mock.json` (or set `HPC_MANAGER=pbs` and
re-seed with the equivalent env tweak). SSH-mode container exposes both
binary trees regardless of which scheduler the portal targets.

Compose extras:
```bash
docker compose -f docker-compose.dev.yml --profile mongo up -d   # mongo too
docker compose -f docker-compose.dev.yml down                    # stop all
```

## Files written outside the repo

- `/tmp/qhpc-mock/<manager>/*.job`      mock job state (JSON)
- `/tmp/qhpc-dev-jobs/`                 working dir surfaced to the user
- `/tmp/qhpc-dev-home/`                 user's "home" dir for the file browser
- `dev/qhpc.sqlite`                     SQLite store (sqlite mode only)

## Running tests

```bash
npm test                  # vitest, node environment — no external services needed
npm run test:watch        # re-run on file change
npm run test:coverage     # write lcov output to coverage/
```

Tests cover: config cache (mtime invalidation), SQLite driver (CRUD + filter operators),
ANSYS Fluent output parser, and HPC field-name normalization.

## Structured logging

The portal uses [pino](https://getpino.io) for server-side logging.

```bash
LOG_LEVEL=debug npm run dev        # verbose pretty-printed logs in dev
```

Production mode emits newline-delimited JSON to stdout.  Pipe through
`pino-pretty` locally if you need human-readable output from a prod build:

```bash
node server.js | npx pino-pretty
```

Every authenticated request is tagged with a `reqId` UUID that appears in all
log lines emitted during that request's lifetime.
