# Configuration reference

The portal reads `config.json` from `$QHPC_CONFIG_DIR`. That defaults to
`./config`; the installer uses `/etc/qhpc-portal`. The file is JSON with
comments (JSONC). Start from
[`config/config.example.json`](../config/config.example.json).

Admins can also edit the settings in the UI under **Admin → Configuration**.
Saving rewrites the file without comments. Changes apply on the next request,
with no restart, whether made in the UI or by editing the file. The exceptions
are `port`, `https`, `ssl_*`, `tmpdir` and `db.*`: restart the portal after
changing those.

Environment variables, where listed, take precedence over the file.

## Authentication

| Key | Default | Env | Description |
| --- | --- | --- | --- |
| `use_pam` | `true` | `USE_PAM` | Verify passwords through PAM. When `false`, any password is accepted for an existing OS user. **For local development only** |
| `pam_module` | `"login"` | — | PAM service name, i.e. a file in `/etc/pam.d/`. The installer creates `qhpc-portal` |
| `admin_users` | `[]` | `ADMIN_USERS` | OS usernames with portal admin rights. Applies immediately, also to users who already logged in. `root` is always admin |

## Scheduler

| Key | Default | Env | Description |
| --- | --- | --- | --- |
| `manager` | `"slurm"` | `HPC_MANAGER` | Active scheduler: `slurm` or `pbs` |
| `memory` | — | — | `true` to request memory from the scheduler |
| `memory_default` | `2` | — | Default memory per core, in GB |
| `managers.<name>` | — | — | Connection settings for each scheduler; see below |

### `managers.slurm` / `managers.pbs`

| Key | Default | Description |
| --- | --- | --- |
| `method` | `"local"` | `local`: run commands on this host as the user. `ssh`: run them on `serverName` over SSH |
| `binariesDir` | — (required) | Directory containing the scheduler commands, e.g. `/usr/bin/` or `/opt/pbs/bin/` |
| `workingDir` | `"/tmp"` | Where job directories are created. Must be visible to compute nodes |
| `localShell` | `"/bin/sh"` | Shell used to run commands locally |
| `localCopy` | `"/bin/cp"` | Copy command used for local file transfers |
| `useAlternate` | `false` | Use the scheduler's alternate output-path handling |
| `serverName` | `"localhost"` | SSH method: head-node hostname |
| `sshExec`, `scpExec` | `/usr/bin/ssh`, `/usr/bin/scp` | SSH method: client binaries |
| `defaultOpts` | `""` | SSH method: extra SSH options |
| `secretAccessKey` | `""` | SSH method: private key file |
| `useSharedDir`, `sharedDir` | `false`, `""` | SSH method: `workingDir` is mounted on the portal host at `sharedDir` |
| `userParams` | — | Fields copied from the logged-in user into the scheduler context |

## Interactive sessions

| Key | Default | Description |
| --- | --- | --- |
| `remote` | `"turbovnc"` | Remote-desktop protocol: `turbovnc`, `tigervnc` or `virtualgl` (defined in `apps/remotelist.json`) |
| `remote_security` | `"none"` | `none` or `otp` (one-time password) |
| `remote_domain` | `".localdomain"` | Hostname rewrite for compute nodes. `".a=.b"` replaces domain `.a` with `.b`; `".b"` appends `.b` |

## License-server monitoring

| Key | Default | Description |
| --- | --- | --- |
| `lic_servers` | `{}` | Map of `name → { "type": "flexlm" \| "rlm" \| "lmx", "url": [port, host] }` |

Each type uses `managers/<type>_config.json` in the config directory, which
contains `binary` (path to `lmutil`, `rlmutil` or `lmxendutil`) and `cmd`.
The vendor binaries are not distributed with the portal.

## Filesystem

| Key | Default | Description |
| --- | --- | --- |
| `tmpdir` | OS temp dir | Scratch space for uploads and generated job scripts |

## Database

| Key | Default | Env | Description |
| --- | --- | --- | --- |
| `db.driver` | `"mongo"` (code default; the example config uses `sqlite`) | `DB_DRIVER` | `sqlite` or `mongo` |
| `db.file` | `data/qhpc.sqlite` | `SQLITE_FILE` | SQLite database file. A relative path is resolved from the portal directory |
| `db.hostname` | `"localhost"` | `MONGODB_HOST` | MongoDB host |
| `db.port` | `27017` | `MONGODB_PORT` | MongoDB port |
| `db.database` | `"quanta"` | `MONGODB_DATABASE` | MongoDB database name |
| `db.user`, `db.password` | `""` | — | MongoDB credentials |

## Application templates

Applications are edited under **Admin → Applications**, and changes apply
with no restart. The step-by-step guide is [ADD-AN-APP.md](ADD-AN-APP.md);
parsers are covered in [PARSERS.md](PARSERS.md).

The portal reads two layers:

- **Shipped:** `apps/` in the application tree (`applist.json`,
  `templates/<domain>/<app>.json`, per-scheduler fragments in `<app>.d/`).
  Upgrades replace it; don't edit it.
- **Site:** `$QHPC_CONFIG_DIR/apps/`, written by the admin pages. Its
  `applist.json` overrides shipped entries field by field (`"hidden": true`
  removes an application from the Compute page). Its templates and
  `<app>.d/` fragments load after the shipped ones. It also holds uploaded
  logos (`img/`) and parsers (`parsers/`). Back it up with `config.json`.

Fragments whose file name names another scheduler (`-pbs-` while running
Slurm, for example) are skipped.
