# Demo image: the portal with mock Slurm, PAM off and one user, in one container.
#   docker run --rm -p 3000:3000 ghcr.io/quantumhpc/portal:demo
# Then open http://localhost:3000 and sign in as "demo" with any password.
# NEVER use this image on a real system: any password is accepted.
# Build from the repository root:
#   docker build -f deploy/demo/Dockerfile -t qhpc-portal:demo .

FROM node:22-bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ libpam0g-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
# libpam0g: authenticate-pam links to it even with PAM off.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpam0g \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 2001 -s /bin/bash demo \
    && mkdir -p /scratch /var/lib/qhpc/mock /etc/qhpc-portal \
    && chmod 1777 /scratch \
    && chown demo:demo /var/lib/qhpc/mock

WORKDIR /app
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/apps ./apps
COPY --from=build /app/config/managers ./config/managers
COPY --from=build /app/dev/slurm-mock ./dev/slurm-mock
COPY --from=build /app/dev/mock-bin ./dev/mock-bin
COPY --from=build /app/dev/mock-scenarios ./dev/mock-scenarios
COPY --from=build /app/dev/lic-mock ./dev/lic-mock
COPY --chmod=0755 dev/docker/slurm/residual-demo.sh /opt/qhpc-demo/residual-demo.sh
COPY dev/docker/slurm/site/apps /opt/qhpc-site/apps
COPY deploy/demo/config.json /opt/qhpc-site/config.json
COPY --chmod=0755 deploy/demo/entrypoint.sh /usr/local/bin/qhpc-demo

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    QHPC_CONFIG_DIR=/etc/qhpc-portal \
    QHPC_MOCK_STATE_ROOT=/var/lib/qhpc/mock \
    QHPC_MOCK_RUN=1 \
    USE_PAM=false \
    ADMIN_USERS=demo \
    NEXTAUTH_URL=http://localhost:3000

EXPOSE 3000
ENTRYPOINT ["qhpc-demo"]
