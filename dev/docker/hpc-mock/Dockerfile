# SSH-reachable mock HPC head node.
# Same Phase-C scenario-driven mock binaries, served over sshd on :22.
FROM debian:bookworm-slim

ARG HPC_UID=1000
ARG HPC_GID=1000

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssh-server \
        bash \
        bc \
        coreutils \
        ca-certificates \
        curl \
        nodejs \
        procps \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid "$HPC_GID" hpcuser \
 && useradd  --uid "$HPC_UID" --gid "$HPC_GID" \
            --home /home/hpcuser --create-home --shell /bin/bash hpcuser \
 && mkdir -p /home/hpcuser/.ssh \
 && chmod 700 /home/hpcuser/.ssh \
 && chown -R hpcuser:hpcuser /home/hpcuser

# Mock binaries — preserve relative layout so Node ESM imports keep working.
COPY --chown=hpcuser:hpcuser dev/mock-bin       /opt/qhpc-mock/mock-bin
COPY --chown=hpcuser:hpcuser dev/mock-scenarios /opt/qhpc-mock/mock-scenarios
COPY --chown=hpcuser:hpcuser dev/slurm-mock     /opt/qhpc-mock/slurm-mock
COPY --chown=hpcuser:hpcuser dev/pbs-mock       /opt/qhpc-mock/pbs-mock

# Adjust scenario root used by lib.mjs (it climbs ../../ from itself).
RUN chmod -R +x /opt/qhpc-mock/slurm-mock /opt/qhpc-mock/pbs-mock \
 && mkdir -p /tmp/qhpc-mock-jobs \
 && chown hpcuser:hpcuser /tmp/qhpc-mock-jobs \
 && ln -s /opt/qhpc-mock /opt/slurm.bin-root \
 && ln -s /opt/qhpc-mock/slurm-mock /opt/slurm \
 && ln -s /opt/qhpc-mock/pbs-mock   /opt/pbs

# sshd setup.
RUN mkdir -p /run/sshd \
 && sed -i 's/#PermitUserEnvironment.*/PermitUserEnvironment yes/' /etc/ssh/sshd_config \
 && sed -i 's/#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config \
 && sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/'    /etc/ssh/sshd_config \
 && echo 'AcceptEnv QHPC_MOCK_SCENARIO QHPC_MOCK_STATE_ROOT' >> /etc/ssh/sshd_config

# lib.mjs uses path.dirname(path.dirname(__dirname)) to find the project root,
# i.e. /opt — point its scenario dir at /opt/qhpc-mock/mock-scenarios via the
# QHPC_MOCK_SCENARIO_DIR env var carried in the sshd accept list.
ENV QHPC_MOCK_STATE_ROOT=/tmp/qhpc-mock \
    QHPC_MOCK_SCENARIO_DIR=/opt/qhpc-mock/mock-scenarios

# Make the scenario env vars visible to non-interactive sshd sessions.
RUN { \
      echo 'QHPC_MOCK_STATE_ROOT=/tmp/qhpc-mock'; \
      echo 'QHPC_MOCK_SCENARIO_DIR=/opt/qhpc-mock/mock-scenarios'; \
    } >> /etc/environment \
 && { \
      echo 'QHPC_MOCK_STATE_ROOT="/tmp/qhpc-mock"'; \
      echo 'QHPC_MOCK_SCENARIO_DIR="/opt/qhpc-mock/mock-scenarios"'; \
    } > /home/hpcuser/.ssh/environment \
 && chown hpcuser:hpcuser /home/hpcuser/.ssh/environment \
 && chmod 600 /home/hpcuser/.ssh/environment

EXPOSE 22

# Generate host keys once on first start, then exec sshd in foreground.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/sh", "-c", "ssh-keygen -A >/dev/null 2>&1 || true; exec /usr/sbin/sshd -D -e"]
