# Dev image for docker-compose.slurm.yml: a real Slurm cluster plus the portal.
#
# Based on giovtorres/slurm-docker-cluster (MIT, https://github.com/giovtorres/slurm-docker-cluster):
# Rocky Linux 9, Slurm, munge and gosu. Every service uses this one image, so
# users, uids and Slurm versions match across the controller, workers and portal.
ARG SLURM_IMAGE=docker.io/giovtorres/slurm-docker-cluster:26.05.5-3.0.2
FROM ${SLURM_IMAGE}

# Node.js for the portal, plus what `npm ci` needs to build its native modules
# (authenticate-pam, better-sqlite3). The base image already has epel and crb.
RUN set -ex \
    && dnf -y module enable nodejs:22 \
    && dnf -y install --allowerasing nodejs npm gcc-c++ make python3 pam-devel \
       authselect procps-ng \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# PAM for the portal: the same file the installer ships for RHEL-family hosts.
# authselect generates /etc/pam.d/password-auth, which that file includes.
RUN authselect select minimal --force >/dev/null
COPY deploy/pam/qhpc-portal.rhel /etc/pam.d/qhpc-portal

# Dev users, password "password". alice is the portal admin; bob shows what
# another user can and cannot see. ood (uid 1001) comes from the base image.
RUN set -ex \
    && useradd -m -u 2001 alice \
    && useradd -m -u 2002 bob \
    && for u in alice bob ood; do echo "$u:password" | chpasswd; done \
    && mkdir -p /scratch /opt/qhpc-demo /var/lib/qhpc \
    && chmod 1777 /scratch

# Optional: OpenFOAM (openfoam.com release) for the cavity demo,
# dev/demo/openfoam-cavity.sh. About 840 MB, so off by default:
#   WITH_OPENFOAM=1 dev/slurm-cluster.sh up
ARG WITH_OPENFOAM=0
ARG OPENFOAM_VERSION=2512
RUN if [ "$WITH_OPENFOAM" = 1 ]; then set -ex \
    && dnf -y install dnf-plugins-core \
    && dnf -y copr enable openfoam/openfoam \
    && dnf -y install "openfoam${OPENFOAM_VERSION}-default" "openfoam${OPENFOAM_VERSION}-tutorials" \
    && dnf clean all && rm -rf /var/cache/dnf; \
    fi

COPY --chmod=0755 dev/docker/slurm/residual-demo.sh /opt/qhpc-demo/residual-demo.sh
COPY --chmod=0755 dev/docker/slurm/portal-entrypoint.sh /usr/local/bin/portal-entrypoint.sh
COPY dev/docker/slurm/site /opt/qhpc-site
