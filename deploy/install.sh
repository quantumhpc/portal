#!/usr/bin/env bash
# ===========================================================================
# QuantumHPC Portal — installer for an HPC login / head node
# ---------------------------------------------------------------------------
# Builds the portal from this source tree, installs it under --prefix, writes
# a site config + environment file (never overwriting existing ones), a PAM
# service and a systemd unit.
#
# Usage (as root, from a clone of the repository):
#   sudo ./deploy/install.sh --url https://portal.example.org --admin alice
#
# Options:
#   --prefix DIR       install directory            (default /opt/qhpc-portal)
#   --config-dir DIR   site configuration directory (default /etc/qhpc-portal)
#   --data-dir DIR     database + scratch directory (default /var/lib/qhpc-portal)
#   --url URL          public URL users browse to   (default https://$(hostname -f))
#   --port PORT        local port the portal listens on (default 3000)
#   --admin USERS      comma-separated OS users granted portal admin
#   --manager NAME     scheduler: slurm | pbs       (default: auto-detect)
#   --no-systemd       do not install/enable the systemd unit
#   --start            start (or restart) the service when done
#   -h, --help         show this help
#
# Re-running the script upgrades the code in --prefix and keeps your config.
# ===========================================================================
set -euo pipefail

PREFIX=/opt/qhpc-portal
CONFIG_DIR=/etc/qhpc-portal
DATA_DIR=/var/lib/qhpc-portal
URL=""
PORT=3000
ADMINS=""
MANAGER=""
WITH_SYSTEMD=1
START=0

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)      PREFIX="$2"; shift 2 ;;
    --config-dir)  CONFIG_DIR="$2"; shift 2 ;;
    --data-dir)    DATA_DIR="$2"; shift 2 ;;
    --url)         URL="$2"; shift 2 ;;
    --port)        PORT="$2"; shift 2 ;;
    --admin)       ADMINS="$2"; shift 2 ;;
    --manager)     MANAGER="$2"; shift 2 ;;
    --no-systemd)  WITH_SYSTEMD=0; shift ;;
    --start)       START=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
[ "$(uname -s)" = "Linux" ] || die "The portal must be installed on Linux."
[ "$(id -u)" -eq 0 ]       || die "Run as root (the portal switches to each user's uid/gid)."
[ -f "$SRC_DIR/package.json" ] || die "Run this script from a clone of the portal repository."

if [ -f /etc/pam.d/common-auth ]; then FAMILY=debian; else FAMILY=rhel; fi

hint() {
  if [ "$FAMILY" = debian ]; then
    echo "    apt-get install -y build-essential python3 libpam0g-dev" >&2
  else
    echo "    dnf install -y gcc-c++ make python3 pam-devel     # RHEL/Rocky/Alma/Fedora" >&2
    echo "    zypper install -y gcc-c++ make python3 pam-devel  # SUSE" >&2
  fi
}

command -v node >/dev/null 2>&1 || die "Node.js >= 20.9 is required (https://nodejs.org or your distro's nodejs:20/22 module)."
command -v npm  >/dev/null 2>&1 || die "npm is required."
NODE_BIN="$(command -v node)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' \
  || die "Node.js >= 20.9 is required (found $(node -v))."

missing=0
for tool in make g++ python3; do
  command -v "$tool" >/dev/null 2>&1 || { warn "missing build tool: $tool"; missing=1; }
done
[ -f /usr/include/security/pam_appl.h ] || { warn "missing PAM development headers"; missing=1; }
if [ "$missing" -eq 1 ]; then
  echo "Install the build prerequisites, then re-run:" >&2; hint; exit 1
fi

if [ -z "$MANAGER" ]; then
  if command -v sbatch >/dev/null 2>&1; then MANAGER=slurm
  elif command -v qsub >/dev/null 2>&1; then MANAGER=pbs
  else MANAGER=slurm; warn "No sbatch/qsub found in PATH; defaulting to slurm — set binariesDir in $CONFIG_DIR/config.json."
  fi
fi
case "$MANAGER" in slurm|pbs) ;; *) die "--manager must be slurm or pbs";; esac

BIN_DIR="/usr/bin/"
probe=$([ "$MANAGER" = slurm ] && echo sbatch || echo qsub)
if command -v "$probe" >/dev/null 2>&1; then BIN_DIR="$(dirname "$(command -v "$probe")")/"; fi

[ -n "$URL" ] || URL="https://$(hostname -f 2>/dev/null || hostname)"

info "Installing QuantumHPC Portal"
echo "    source:     $SRC_DIR"
echo "    prefix:     $PREFIX"
echo "    config:     $CONFIG_DIR"
echo "    data:       $DATA_DIR"
echo "    url:        $URL  (listening on 127.0.0.1:$PORT)"
echo "    scheduler:  $MANAGER  ($BIN_DIR)"

# ---------------------------------------------------------------------------
# Code + build
# ---------------------------------------------------------------------------
mkdir -p "$PREFIX"
if [ "$(cd "$PREFIX" && pwd)" != "$SRC_DIR" ]; then
  info "Copying sources to $PREFIX"
  tar -C "$SRC_DIR" \
      --exclude=./.git --exclude=./node_modules --exclude=./.next \
      --exclude=./config/config.json --exclude=./dev/qhpc.sqlite --exclude=./.env.local \
      --exclude=./dev/keys --exclude=./coverage --exclude=./tsconfig.tsbuildinfo \
      -cf - . | tar -C "$PREFIX" -xf -
fi

cd "$PREFIX"
info "Installing dependencies (npm ci)"
npm ci --no-audit --no-fund
info "Building (npm run build)"
NEXT_TELEMETRY_DISABLED=1 npm run build

# ---------------------------------------------------------------------------
# Site configuration (kept on upgrade)
# ---------------------------------------------------------------------------
mkdir -p "$CONFIG_DIR/managers" "$DATA_DIR/tmp"
chmod 0755 "$CONFIG_DIR"
chmod 0700 "$DATA_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  info "Writing $CONFIG_DIR/config.json"
  MANAGER="$MANAGER" BIN_DIR="$BIN_DIR" ADMINS="$ADMINS" DATA_DIR="$DATA_DIR" \
  node -e '
    const fs = require("fs");
    let s = fs.readFileSync(process.argv[1], "utf8");
    const admins = (process.env.ADMINS || "").split(",").map(u => u.trim()).filter(Boolean);
    s = s.replace(/"manager":\s*"slurm"/, `"manager": "${process.env.MANAGER}"`)
         .replace(/"admin_users":\s*\[\]/, `"admin_users": ${JSON.stringify(admins)}`)
         .replaceAll("/var/lib/qhpc-portal", process.env.DATA_DIR);
    const key = process.env.MANAGER === "slurm" ? "\"/usr/bin/\"" : "\"/opt/pbs/bin/\"";
    s = s.replace(`"binariesDir":  ${key}`, `"binariesDir":  ${JSON.stringify(process.env.BIN_DIR)}`);
    fs.writeFileSync(process.argv[2], s);
  ' "$PREFIX/config/config.example.json" "$CONFIG_DIR/config.json"
  chmod 0644 "$CONFIG_DIR/config.json"
else
  info "Keeping existing $CONFIG_DIR/config.json"
fi

for f in flexlm_config.json rlm_config.json lmx_config.json; do
  [ -f "$CONFIG_DIR/managers/$f" ] || cp "$PREFIX/config/managers/$f" "$CONFIG_DIR/managers/$f"
done

if [ ! -f "$CONFIG_DIR/portal.env" ]; then
  info "Writing $CONFIG_DIR/portal.env (with a generated NEXTAUTH_SECRET)"
  SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))')"
  sed -e "s#^NEXTAUTH_URL=.*#NEXTAUTH_URL=$URL#" \
      -e "s#^NEXTAUTH_SECRET=.*#NEXTAUTH_SECRET=$SECRET#" \
      -e "s#^PORT=.*#PORT=$PORT#" \
      -e "s#^QHPC_CONFIG_DIR=.*#QHPC_CONFIG_DIR=$CONFIG_DIR#" \
      "$PREFIX/deploy/portal.env.example" > "$CONFIG_DIR/portal.env"
  chmod 0600 "$CONFIG_DIR/portal.env"
else
  info "Keeping existing $CONFIG_DIR/portal.env"
fi

# ---------------------------------------------------------------------------
# PAM
# ---------------------------------------------------------------------------
if [ ! -f /etc/pam.d/qhpc-portal ]; then
  info "Installing PAM service /etc/pam.d/qhpc-portal ($FAMILY)"
  install -m 0644 "$PREFIX/deploy/pam/qhpc-portal.$FAMILY" /etc/pam.d/qhpc-portal
fi

# ---------------------------------------------------------------------------
# systemd
# ---------------------------------------------------------------------------
if [ "$WITH_SYSTEMD" -eq 1 ] && command -v systemctl >/dev/null 2>&1; then
  info "Installing systemd unit qhpc-portal.service"
  sed -e "s#@PREFIX@#$PREFIX#g" -e "s#@NODE@#$NODE_BIN#g" \
      -e "s#^EnvironmentFile=.*#EnvironmentFile=$CONFIG_DIR/portal.env#" \
      -e "s#^ReadWritePaths=.*#ReadWritePaths=$CONFIG_DIR $DATA_DIR#" \
      "$PREFIX/deploy/systemd/qhpc-portal.service" > /etc/systemd/system/qhpc-portal.service
  systemctl daemon-reload
  systemctl enable qhpc-portal.service >/dev/null
  if [ "$START" -eq 1 ]; then
    systemctl restart qhpc-portal.service
    info "Service started: systemctl status qhpc-portal"
  fi
fi

cat <<EOF

=== QuantumHPC Portal installed ============================================

  Next steps:
    1. Review   $CONFIG_DIR/config.json   (scheduler, workingDir, admins)
    2. Put a TLS reverse proxy in front:  $PREFIX/deploy/nginx/qhpc-portal.conf
    3. Start:   systemctl start qhpc-portal     logs: journalctl -u qhpc-portal -f
    4. Browse:  $URL   and log in with your cluster account

  Full guide: $PREFIX/docs/INSTALL.md
============================================================================
EOF
