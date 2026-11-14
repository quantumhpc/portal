#!/bin/bash
# Portal container for docker-compose.slurm.yml: join the Slurm cluster
# (munge + shared /etc/slurm), seed the site config once, then run `next dev`
# on the bind-mounted source.
set -euo pipefail

echo "---> Starting munged ..."
gosu munge /usr/sbin/munged

echo "---> Waiting for slurmctld ..."
until (: >/dev/tcp/slurmctld/6817) 2>/dev/null; do sleep 2; done

# Seed $QHPC_CONFIG_DIR on the first start only: later starts keep what the
# admin pages wrote (applications, parsers, config).
if [ ! -f "$QHPC_CONFIG_DIR/config.json" ]; then
    echo "---> Seeding $QHPC_CONFIG_DIR from /opt/qhpc-site ..."
    cp -a /opt/qhpc-site/. "$QHPC_CONFIG_DIR/"
fi

# License-type settings, as deploy/install.sh does. Outside the seed step, so
# volumes created before this was added get them too.
mkdir -p "$QHPC_CONFIG_DIR/managers"
for f in flexlm_config.json rlm_config.json lmx_config.json; do
    [ -f "$QHPC_CONFIG_DIR/managers/$f" ] || cp "/app/config/managers/$f" "$QHPC_CONFIG_DIR/managers/$f"
done

# Jobs run under /scratch on every node; it must stay writable by all users.
chmod 1777 /scratch

# node_modules lives in a volume: rebuild it (native modules for this OS)
# when it is empty or package-lock.json changed.
cd /app
stamp=node_modules/.qhpc-lock-hash
hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$hash" ]; then
    echo "---> npm ci (first start or package-lock.json changed) ..."
    npm ci --no-audit --no-fund
    echo "$hash" > "$stamp"
fi

echo "---> Starting the portal (next dev) ..."
exec npx next dev -H 0.0.0.0 -p 3000
