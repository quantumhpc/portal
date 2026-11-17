# Installing QuantumHPC Portal on a cluster

This guide covers a production install on an HPC **login or head node**:
one where users already log in and where the scheduler commands
(`sbatch`/`squeue`, or `qsub`/`qstat`) work.

If you only want to try the portal on a laptop, use the
[development setup](../CONTRIBUTING.md#development-setup) instead. It runs
against mock schedulers and needs no cluster.

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Quick install](#quick-install)
- [Manual install](#manual-install)
- [TLS reverse proxy](#tls-reverse-proxy)
- [Scheduler setup](#scheduler-setup)
- [Authentication (PAM)](#authentication-pam)
- [Database](#database)
- [Upgrading](#upgrading)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)

## How it works

```
 browser ──HTTPS──▶ nginx (TLS) ──▶ portal (Node.js, 127.0.0.1:3000, root)
                                       │
                                       ├─ PAM: verify username/password
                                       ├─ spawn sbatch/squeue/... as the user's uid/gid
                                       └─ read/write files in the user's home & scratch as that user
```

- Users sign in with their **cluster account**. The portal checks the password
  through PAM, so LDAP, SSSD, Kerberos and local accounts all work if they
  work for SSH.
- Scheduler commands run **as the logged-in user**: the portal process switches
  to the user's uid/gid for each command. Jobs, quotas and accounting behave
  exactly as if the user had typed the command in a shell.
- To do this, the portal service runs as **root**. That is why it must
  listen on localhost only, behind a TLS reverse proxy, and why its
  environment file is root-only. Commands run on a user's behalf never
  receive the portal's secrets.
- The database (SQLite by default, or MongoDB) only stores portal
  metadata: admin flags, job records and preferences. It never stores passwords.

## Requirements

| Component | Version / notes |
| --- | --- |
| OS | Linux: RHEL/Rocky/Alma 8+, Ubuntu 22.04+, Debian 12+, SUSE 15+ |
| Node.js | **20.9 or newer** (22 LTS recommended). See [nodejs.org](https://nodejs.org) or your distro's `nodejs:20`/`nodejs:22` module stream |
| Build tools | `make`, `g++`, `python3`: native modules (PAM, SQLite) are compiled during install |
| PAM headers | `pam-devel` (RHEL/SUSE) or `libpam0g-dev` (Debian/Ubuntu) |
| Scheduler | Slurm or PBS Pro/OpenPBS client commands on the node |
| Reverse proxy | nginx or Apache with a TLS certificate |
| Disk | ~1 GB for the application and its dependencies |

Install the prerequisites:

```bash
# RHEL / Rocky / Alma
dnf module enable -y nodejs:22 && dnf install -y nodejs gcc-c++ make python3 pam-devel nginx

# Ubuntu / Debian (Node 22 from NodeSource or your preferred source)
apt-get install -y nodejs npm build-essential python3 libpam0g-dev nginx
```

## Quick install

```bash
git clone https://github.com/quantumhpc/portal.git
cd portal
sudo ./deploy/install.sh --url https://portal.example.org --admin alice,bob --start
```

The installer:

1. checks Node.js, the build tools and the PAM headers;
2. copies the sources to `/opt/qhpc-portal`, runs `npm ci` and builds;
3. writes `/etc/qhpc-portal/config.json`, auto-detecting Slurm or PBS from
   `PATH`, and `/etc/qhpc-portal/portal.env` with a generated
   `NEXTAUTH_SECRET`. **Existing files are never overwritten**;
4. installs the PAM service `/etc/pam.d/qhpc-portal`;
5. installs and enables `qhpc-portal.service`.

Run `./deploy/install.sh --help` for all options: `--prefix`,
`--config-dir`, `--data-dir`, `--port`, `--manager`, `--no-systemd`.

Then [configure the reverse proxy](#tls-reverse-proxy), review
`/etc/qhpc-portal/config.json`, and browse to your URL.

## Manual install

If you prefer to do the steps yourself, or package the portal:

```bash
# 1. Code
git clone https://github.com/quantumhpc/portal.git /opt/qhpc-portal
cd /opt/qhpc-portal
npm ci && npm run build

# 2. Configuration
install -d -m 0755 /etc/qhpc-portal /etc/qhpc-portal/managers
install -d -m 0700 /var/lib/qhpc-portal
cp config/config.example.json /etc/qhpc-portal/config.json
cp config/managers/{flexlm,rlm,lmx}_config.json /etc/qhpc-portal/managers/
install -m 0600 deploy/portal.env.example /etc/qhpc-portal/portal.env
sed -i "s#^NEXTAUTH_SECRET=.*#NEXTAUTH_SECRET=$(openssl rand -base64 48)#" /etc/qhpc-portal/portal.env
$EDITOR /etc/qhpc-portal/config.json /etc/qhpc-portal/portal.env

# 3. PAM (pick the file matching your distro)
cp deploy/pam/qhpc-portal.rhel /etc/pam.d/qhpc-portal     # or qhpc-portal.debian

# 4. systemd
sed -e "s#@PREFIX@#/opt/qhpc-portal#g" -e "s#@NODE@#$(command -v node)#g" \
    deploy/systemd/qhpc-portal.service > /etc/systemd/system/qhpc-portal.service
systemctl daemon-reload && systemctl enable --now qhpc-portal
```

### Environment variables

Set these in `/etc/qhpc-portal/portal.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | **yes** | ≥ 32 random characters used to sign sessions. The server refuses to start without it |
| `NEXTAUTH_URL` | **yes** | Public URL, e.g. `https://portal.example.org` |
| `QHPC_CONFIG_DIR` | no | Directory with `config.json` and `managers/` (default `./config`) |
| `HOSTNAME` / `PORT` | no | Listen address (default `127.0.0.1:3000` in the unit) |
| `HPC_MANAGER` | no | Overrides `manager` (`slurm` or `pbs`) |
| `ADMIN_USERS` | no | Overrides `admin_users` (comma-separated) |
| `USE_PAM` | no | Overrides `use_pam`. **Never set it to `false` on a shared system** |
| `DB_DRIVER`, `SQLITE_FILE`, `MONGODB_HOST`, `MONGODB_PORT`, `MONGODB_DATABASE` | no | Override the `db` block |
| `LOG_LEVEL` | no | `trace` … `fatal` (default `info`) |

All `config.json` settings are described in
[CONFIGURATION.md](CONFIGURATION.md).

## TLS reverse proxy

The portal listens on `127.0.0.1:3000` and expects a reverse proxy to
terminate TLS. For nginx, start from the provided file:

```bash
cp /opt/qhpc-portal/deploy/nginx/qhpc-portal.conf /etc/nginx/conf.d/
$EDITOR /etc/nginx/conf.d/qhpc-portal.conf   # server_name + certificate paths
nginx -t && systemctl reload nginx
```

On SELinux systems, allow nginx to connect to the local port:
`setsebool -P httpd_can_network_connect 1`.

Make sure `NEXTAUTH_URL` matches the URL users type, including `https://`.

### Remote desktops in the browser (optional)

Browser access to VNC desktops needs websockify next to the portal and two
nginx blocks (already in the shipped config). See
[remote-desktop.md](remote-desktop.md).

## Scheduler setup

In `/etc/qhpc-portal/config.json`:

```jsonc
"manager": "slurm",
"managers": {
  "slurm": {
    "method": "local",            // portal runs on a node with the Slurm client
    "binariesDir": "/usr/bin/",   // where sbatch/squeue/scontrol live
    "workingDir": "/scratch",     // job directories (shared with compute nodes)
    "localShell": "/bin/bash"
  }
}
```

- **`local` method (recommended).** Install the portal on a login node. The
  scheduler commands run locally as each user.
- **`ssh` method.** The portal host is not a cluster node and reaches the head
  node over SSH (`serverName`, `secretAccessKey`, `sshExec`). The key must be
  able to log in as each portal user, for example through host-based
  authentication. If `workingDir` is also mounted on the portal host, set
  `useSharedDir` and `sharedDir`.

For PBS Pro or OpenPBS, set `"manager": "pbs"` and point the `pbs` block's
`binariesDir` at `/opt/pbs/bin/`.

Application submission forms (ANSYS, OpenFOAM, STAR-CCM+, Abaqus, …) are JSON
templates in `apps/templates/`. Admins can manage them from **Admin → Apps**.
Edit `parameters.appBinaries` in each template to match your module or install
paths.

### License-server monitoring (optional)

The **License Usage** page queries FlexLM, RLM or LM-X servers listed in
`lic_servers`. Their status utilities are proprietary and **not distributed**
with the portal. Copy `lmutil`, `rlmutil` and `lmxendutil` from your vendor
installation into `/opt/qhpc-portal/binaries/`, or edit
`/etc/qhpc-portal/managers/<type>_config.json` to point at them.

## Authentication (PAM)

The installer creates `/etc/pam.d/qhpc-portal`, which includes your system's
standard `auth` and `account` stacks, and sets `"pam_module": "qhpc-portal"`.
Edit that file to apply portal-specific rules, such as an access group with
`pam_succeed_if.so user ingroup hpc-portal` or MFA.

Admins are listed in `admin_users`. They are flagged on their first login,
and further admins can be promoted from **Admin → Users**.

## Database

- **SQLite** (default): a single file, `/var/lib/qhpc-portal/qhpc.sqlite`.
  Nothing else to install. Back it up with
  `sqlite3 qhpc.sqlite ".backup backup.sqlite"`.
- **MongoDB**: set `"driver": "mongo"` and the connection fields in the `db`
  block. Use it if you already run MongoDB or want to run several portal
  instances.

## Upgrading

```bash
cd ~/portal && git pull                 # or check out a release tag
sudo ./deploy/install.sh                # rebuilds /opt/qhpc-portal, keeps /etc/qhpc-portal
sudo systemctl restart qhpc-portal
```

Read the [CHANGELOG](../CHANGELOG.md) before upgrading.

## Uninstalling

```bash
systemctl disable --now qhpc-portal
rm -rf /opt/qhpc-portal /etc/systemd/system/qhpc-portal.service /etc/pam.d/qhpc-portal
# Data and configuration (keep for reinstall):
rm -rf /etc/qhpc-portal /var/lib/qhpc-portal
```

## Troubleshooting

Start with **Admin → Health**. It checks sign-in (PAM), the scheduler (as
you, the signed-in administrator), job and temporary folders, the database
and the site configuration, and gives a fix for each problem.
**Support bundle** downloads those results with the portal, Node.js and OS
versions and the configuration. Passwords, secrets, tokens and connection
strings are replaced by `[redacted]`. Read the file before you share it.

| Symptom | Fix |
| --- | --- |
| `FATAL: NEXTAUTH_SECRET must be set…` in the journal | Set a ≥ 32 character secret in `portal.env` |
| `npm ci` fails building `authenticate-pam` (`security/pam_appl.h: No such file`) | Install `pam-devel` / `libpam0g-dev` |
| Login always fails | Check `journalctl -u qhpc-portal` and `/var/log/secure` or `auth.log`. Confirm `pam_module` names a file in `/etc/pam.d/` |
| Login works, then you're redirected back to the login page | `NEXTAUTH_URL` doesn't match the URL in the browser, or the proxy doesn't forward `X-Forwarded-Proto` |
| Cluster/Jobs pages show `HPC_EXEC_FAILED` | Wrong `binariesDir`, or the command prints to stderr for that user. Test with `sudo -u <user> -i <binariesDir>/squeue` |
| `502 Bad Gateway` | Portal not running (`systemctl status qhpc-portal`), or SELinux is blocking nginx (see above) |

Logs: `journalctl -u qhpc-portal -f`. Set `LOG_LEVEL=debug` in
`portal.env` for more detail.

Still stuck? [Open an issue](https://github.com/quantumhpc/portal/issues/new/choose)
and attach the support bundle from Admin → Health, or give your distro, scheduler
and the relevant log lines (with secrets removed).
