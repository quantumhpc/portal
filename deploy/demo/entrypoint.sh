#!/bin/bash
# Demo image entrypoint: seed the site config on first start, then run the portal.
set -euo pipefail

if [ ! -f "$QHPC_CONFIG_DIR/config.json" ]; then
    cp -a /opt/qhpc-site/. "$QHPC_CONFIG_DIR/"
    mkdir -p "$QHPC_CONFIG_DIR/managers"
    cp /app/config/managers/{flexlm,rlm,lmx}_config.json "$QHPC_CONFIG_DIR/managers/"
fi
mkdir -p /var/lib/qhpc/tmp

# A fresh secret per container is fine for a demo: sessions end on restart.
NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-$(head -c 32 /dev/urandom | base64)}
export NEXTAUTH_SECRET

cat <<MSG
QuantumHPC Portal demo: open ${NEXTAUTH_URL} and sign in as "demo" with any password.
Mock Slurm: jobs run inside this container. Not for real use: PAM is off.
MSG
exec npx next start -H 0.0.0.0 -p 3000
