#!/usr/bin/env bash
# Dev environment on a real Slurm cluster in containers (docker-compose.slurm.yml).
#
#   dev/slurm-cluster.sh up            build if needed, start, wait, print URL and logins
#   dev/slurm-cluster.sh down          stop (keeps cluster, homes and portal data)
#   dev/slurm-cluster.sh clean         stop and delete all volumes
#   dev/slurm-cluster.sh logs [svc]    follow logs (all services, or one)
#   dev/slurm-cluster.sh shell [svc]   shell in slurmctld (default) or another service
#   dev/slurm-cluster.sh status        sinfo + squeue
#   dev/slurm-cluster.sh test          smoke test: PAM login, submit, monitor, isolation
#   dev/slurm-cluster.sh cavity-case [cells] [file]
#                                      OpenFOAM lid-driven cavity case as a .tar.gz
#                                      (default 160x160 cells, ./cavity.tar.gz)
#   dev/slurm-cluster.sh cavity [cells]
#                                      upload that case as alice, run it with the
#                                      OpenFOAM app, wait, check the residuals
#
# The cavity commands need OpenFOAM in the image: WITH_OPENFOAM=1 dev/slurm-cluster.sh up
#
# Works with Docker (when a daemon answers) or rootless podman (`podman compose`).
# Env: PORTAL_PORT (3080), CPU_WORKER_COUNT (2), SLURM_IMAGE_TAG, USE_PAM (true).
set -euo pipefail

cd "$(dirname "$0")/.."
PORT=${PORTAL_PORT:-3080}
BASE="http://localhost:$PORT"

if docker info >/dev/null 2>&1; then
    COMPOSE=(docker compose -f docker-compose.slurm.yml)
elif command -v podman >/dev/null 2>&1; then
    # podman compose drives the docker-compose plugin through the user's podman socket.
    if command -v systemctl >/dev/null 2>&1 && ! systemctl --user is-active --quiet podman.socket; then
        echo "---> Starting the user podman socket (systemctl --user start podman.socket)"
        systemctl --user start podman.socket
    fi
    export PODMAN_COMPOSE_WARNING_LOGS=false
    COMPOSE=(podman compose -f docker-compose.slurm.yml)
else
    echo "Neither a Docker daemon nor podman was found." >&2
    exit 1
fi

compose() { "${COMPOSE[@]}" "$@"; }
ctl() { compose exec -T slurmctld "$@"; }

wait_healthy() {
    local svc=$1 tries=${2:-90}
    printf -- "---> Waiting for %s " "$svc"
    for ((i = 0; i < tries; i++)); do
        if [ "$(compose ps --format '{{.Health}}' "$svc" 2>/dev/null | head -1)" = healthy ]; then
            echo " ready"
            return 0
        fi
        printf .
        sleep 5
    done
    echo " timed out"
    compose logs --tail 40 "$svc" >&2
    return 1
}

cmd_up() {
    compose build slurmdbd
    compose up -d
    wait_healthy slurmctld
    # First start runs `npm ci` inside the container: allow ~10 min.
    wait_healthy portal 120
    cat <<EOF

Portal:   $BASE
Logins:   alice / password  (admin)
          bob   / password
Cluster:  dev/slurm-cluster.sh status   (shell: dev/slurm-cluster.sh shell)
Demo app: Start a job → Residual demo
EOF
}

# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=1; }

# json <expression on `d`>  — read JSON from stdin with python (no jq needed)
json() { python3 -I -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

login() { # login <user> <password> -> cookie jar path; returns 1 if no session
    local jar="$WORK/$1.jar" token
    rm -f "$jar"
    token=$(curl -sf -c "$jar" "$BASE/api/auth/csrf" | json 'd["csrfToken"]')
    curl -sf -o /dev/null -b "$jar" -c "$jar" \
        --data-urlencode "csrfToken=$token" --data-urlencode "username=$1" \
        --data-urlencode "password=$2" --data-urlencode "json=true" \
        "$BASE/api/auth/callback/credentials" || true
    [ "$(curl -sf -b "$jar" "$BASE/api/auth/session" | json 'd.get("user",{}).get("username","")')" = "$1" ]
}

api() { local user=$1; shift; curl -s -b "$WORK/$user.jar" "$@"; }

submit() { # submit <user> <iterations> -> job id
    api "$1" -H 'Content-Type: application/json' "$BASE/api/manager/submit" -d "{
        \"appDomain\": \"demo\", \"appName\": \"residual_demo\", \"type\": \"batch\",
        \"jobName\": \"smoke\", \"numProcs\": 1, \"queue\": \"\", \"version\": \"v1\",
        \"iterations\": \"$2\", \"delay\": \"1\", \"useinputFile\": false }" | json 'd.get("jobId") or d'
}

job_state() { ctl scontrol show job "$1" 2>/dev/null | grep -o 'JobState=[A-Z_]*' | cut -d= -f2; }

cmd_test() {
    local nodes job state workdir out res
    nodes=$(ctl sinfo -h -N -o '%N %t' | sort -u)
    if [ "$(echo "$nodes" | grep -c .)" -ge 2 ]; then pass "sinfo lists the workers: $(echo "$nodes" | tr '\n' ' ')"; else fail "sinfo: $nodes"; fi

    if login alice password; then pass "PAM login alice"; else fail "PAM login alice"; fi
    if login alice wrong; then fail "wrong password accepted"; else pass "wrong password refused"; fi
    login alice password
    login bob password || fail "PAM login bob"

    res=$(api alice "$BASE/api/manager/nodes?action=list" | json 'len(d.get("nodes",[]))')
    [ "$res" -ge 2 ] && pass "nodes API: $res nodes" || fail "nodes API: $res"
    res=$(api alice "$BASE/api/manager/queues" | json '" ".join(q.get("name") or q.get("PartitionName","?") for q in d)')
    [[ " $res " == *" cpu "* ]] && pass "queues API: $res" || fail "queues API: $res"

    job=$(submit alice 8)
    if [[ "$job" =~ ^[0-9]+$ ]]; then pass "submitted job $job"; else fail "submit: $job"; return; fi
    for _ in $(seq 30); do state=$(job_state "$job"); [ "$state" = RUNNING ] && break; sleep 1; done
    [ "$state" = RUNNING ] && pass "job $job running on $(ctl squeue -h -j "$job" -o %N)" || fail "job state: $state"

    res=$(api alice "$BASE/api/manager/jobs?action=list" | python3 -I -c "import sys; print('$job' in sys.stdin.read())")
    [ "$res" = True ] && pass "job $job in the portal's job list" || fail "job not in the portal's job list"

    sleep 4
    res=$(api alice "$BASE/api/jobs?action=residuals&jobId=$job&appName=residual_demo&appDomain=demo" \
        | json 'sum(len(s["data"]) for s in (d["graph"] if isinstance(d["graph"], list) else []))')
    [ "${res:-0}" -gt 0 ] && pass "progress while running: $res points" || fail "progress while running: $res"

    workdir=$(ctl scontrol show job "$job" | grep -o 'WorkDir=[^ ]*' | cut -d= -f2)
    out="$workdir/output.log"
    res=$(api bob -o /dev/null -w '%{http_code}' "$BASE/api/data/resource?resource=$(python3 -I -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$out")")
    [ "$res" != 200 ] && pass "bob cannot read alice's output (HTTP $res)" || fail "bob read alice's output"

    for _ in $(seq 40); do state=$(job_state "$job"); [ "$state" = COMPLETED ] && break; sleep 1; done
    [ "$state" = COMPLETED ] && pass "job $job completed" || fail "job end state: $state"
    res=$(compose exec -T cpu-worker stat -c %U "$out" 2>/dev/null || true)
    [ "$res" = alice ] && pass "output file owned by alice: $out" || fail "output owner: '$res' ($out)"
    res=$(api alice "$BASE/api/jobs?action=residuals&jobId=$job&appName=residual_demo&appDomain=demo" \
        | json '(d.get("custom") or {}).get("message",{}).get("type","")')
    [ "$res" = success ] && pass "parser reports success" || fail "parser message: '$res'"

    job=$(submit alice 120)
    sleep 3
    api bob "$BASE/api/manager/jobs?action=cancel&jobId=$job" >/dev/null || true
    sleep 2
    state=$(job_state "$job")
    [[ "$state" =~ ^(RUNNING|PENDING)$ ]] && pass "bob cannot cancel alice's job ($state)" || fail "after bob's cancel: $state"
    api alice "$BASE/api/manager/jobs?action=cancel&jobId=$job" >/dev/null || true
    sleep 2
    state=$(job_state "$job")
    [ "$state" = CANCELLED ] && pass "alice cancels her job" || fail "after alice's cancel: $state"

    # Saved runs: save a set-up, start it again, and keep it private to its owner.
    res=$(api alice -H 'Content-Type: application/json' "$BASE/api/saved-runs" -d '{
        "name": "smoke set-up", "appDomain": "demo", "appName": "residual_demo", "type": "batch",
        "jobArgs": { "jobName": "saved", "numProcs": 2, "queue": "", "version": "v1", "iterations": "5", "delay": "1" } }' \
        | json 'd.get("_id","")')
    [[ "$res" =~ ^[0-9a-f]{24}$ ]] && pass "saved run $res" || { fail "save run: $res"; return "$FAILED"; }
    local saved=$res
    res=$(api bob -o /dev/null -w '%{http_code}' "$BASE/api/saved-runs?id=$saved")
    [ "$res" = 404 ] && pass "bob cannot open alice's saved run" || fail "bob opened alice's saved run (HTTP $res)"
    job=$(api alice "$BASE/api/saved-runs?id=$saved" \
        | python3 -I -c 'import json,sys; r=json.load(sys.stdin); a=r["jobArgs"]; a.update(appDomain=r["appDomain"], appName=r["appName"], type=r["type"], useinputFile=False); print(json.dumps(a))' \
        | api alice -H 'Content-Type: application/json' "$BASE/api/manager/submit" -d @- | json 'd.get("jobId") or d')
    res=$(ctl scontrol show job "$job" 2>/dev/null | grep -o 'JobName=[^ ]*\|NumCPUs=[0-9]*' | tr '\n' ' ')
    [[ "$res" == *"JobName=saved"* && "$res" == *"NumCPUs=2"* ]] && pass "saved run started as job $job: $res" || fail "saved run job $job: $res"
    api alice -X DELETE "$BASE/api/saved-runs?id=$saved" >/dev/null

    # Admin → Health: all green on this cluster, admin only, and the support bundle holds no secret.
    res=$(api alice "$BASE/api/admin/health" | json '"%d fail, %d warn, %d ok" % (d["summary"]["fail"], d["summary"]["warn"], d["summary"]["ok"])')
    [[ "$res" == "0 fail, 0 warn,"* ]] && pass "health checks: $res" || fail "health checks: $res"
    res=$(api bob -o /dev/null -w '%{http_code}' "$BASE/api/admin/health")
    [ "$res" = 403 ] && pass "bob cannot open Admin → Health" || fail "bob opened Admin → Health (HTTP $res)"
    api alice -o "$WORK/bundle.json" "$BASE/api/admin/health?bundle=1"
    secret=$(compose exec -T portal printenv NEXTAUTH_SECRET 2>/dev/null || true)
    if [ -n "$secret" ] && grep -q "\"format\": \"qhpc-support/1\"" "$WORK/bundle.json" && ! grep -qF "$secret" "$WORK/bundle.json"; then
        pass "support bundle has no secret"
    else
        fail "support bundle missing or leaks NEXTAUTH_SECRET"
    fi

    return "$FAILED"
}

# ---------------------------------------------------------------------------
# OpenFOAM lid-driven cavity (icoFoam), run through the portal
# ---------------------------------------------------------------------------

FOAM_BASHRC=/usr/lib/openfoam/openfoam2512/etc/bashrc

cmd_cavity_case() { # cavity-case [cells] [file]
    local cells=${1:-160} out=${2:-cavity.tar.gz}
    [[ "$cells" =~ ^[0-9]+$ ]] || { echo "cells must be a number" >&2; return 1; }
    ctl test -f "$FOAM_BASHRC" || {
        echo "OpenFOAM is not in the image. Rebuild: WITH_OPENFOAM=1 dev/slurm-cluster.sh up" >&2
        return 1
    }
    # The tutorial is 20x20 cells with deltaT 0.005 s. A finer mesh needs a
    # proportionally smaller time step to keep the same Courant number (about 0.85),
    # so the run takes 5 x cells steps. Write fields about five times.
    ctl bash -c "set -e; rm -rf /tmp/cavity; source $FOAM_BASHRC || true
        cp -r \$FOAM_TUTORIALS/incompressible/icoFoam/cavity/cavity /tmp/cavity
        cd /tmp/cavity
        sed -i 's/(20 20 1)/($cells $cells 1)/' system/blockMeshDict
        sed -i \"s/^deltaT .*/deltaT          \$(awk 'BEGIN { print 0.1 / $cells }');/\" system/controlDict
        sed -i 's/^writeInterval .*/writeInterval   $cells;/' system/controlDict
        cd /tmp && tar -czf cavity.tar.gz cavity" >&2
    ctl cat /tmp/cavity.tar.gz > "$out"
    echo "$out: ${cells}x${cells} cells, $((5 * cells)) time steps" >&2
}

upload() { # upload <user> <file> -> server path of the uploaded file
    local user=$1 file=$2 loc
    loc=$(api "$user" -si -X POST "$BASE/api/data/tus" -H 'Tus-Resumable: 1.0.0' \
        -H "Upload-Length: $(stat -c %s "$file")" \
        -H "Upload-Metadata: filename $(printf %s "${file##*/}" | base64 -w0)" |
        tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }')
    [[ "$loc" == http* ]] || loc="$BASE$loc"
    api "$user" -si -X PATCH "$loc" -H 'Tus-Resumable: 1.0.0' -H 'Upload-Offset: 0' \
        -H 'Content-Type: application/offset+octet-stream' --data-binary "@$file" |
        tr -d '\r' | awk 'tolower($1) == "upload-target:" { print $2 }'
}

cmd_cavity() { # cavity [cells]
    local cells=${1:-160} target job state res
    cmd_cavity_case "$cells" "$WORK/cavity.tar.gz" || return 1
    login alice password || { fail "PAM login alice"; return 1; }
    target=$(upload alice "$WORK/cavity.tar.gz")
    [[ "$target" == /* ]] && pass "uploaded the case: $target" || { fail "upload: '$target'"; return 1; }

    job=$(api alice -H 'Content-Type: application/json' "$BASE/api/manager/submit" -d "{
        \"appDomain\": \"cfd\", \"appName\": \"openfoam\", \"type\": \"batch\",
        \"jobName\": \"cavity\", \"numProcs\": 1, \"queue\": \"\", \"version\": \"v2512\",
        \"solver\": \"icoFoam\", \"blockMesh\": true,
        \"useinputFile\": true, \"inputFileSource\": \"upload\", \"inputFile[]\": \"$target\" }" | json 'd.get("jobId") or d')
    [[ "$job" =~ ^[0-9]+$ ]] && pass "submitted job $job" || { fail "submit: $job"; return 1; }
    echo "     Job page: $BASE/job/$job" >&2

    for ((i = 0; i < 180; i++)); do
        state=$(job_state "$job")
        [[ "$state" =~ ^(COMPLETED|FAILED|CANCELLED|TIMEOUT|OUT_OF_MEMORY)$ ]] && break
        sleep 5
    done
    [ "$state" = COMPLETED ] && pass "job $job completed" || { fail "job $job: $state"; return 1; }

    res=$(api alice "$BASE/api/jobs?action=residuals&jobId=$job&appName=openfoam&appDomain=cfd" | json '
" ".join("%s:%d" % (k, len(v["data"])) for k, v in sorted(d["graph"].items())) + " last_t=%g" % max(p[0] for v in d["graph"].values() for p in v["data"])')
    [[ "$res" == *"Ux:$((5 * cells))"* && "$res" == *"p:$((5 * cells))"* ]] && pass "residuals: $res" || fail "residuals: $res"
    return "$FAILED"
}

case "${1:-up}" in
    up) cmd_up ;;
    down) compose down ;;
    clean) compose down -v ;;
    logs) shift; compose logs -f "$@" ;;
    shell) compose exec "${2:-slurmctld}" bash ;;
    status) ctl sinfo; echo; ctl squeue ;;
    test) cmd_test ;;
    cavity-case) shift; cmd_cavity_case "$@" ;;
    cavity) shift; cmd_cavity "$@" ;;
    *) sed -n '2,21p' "$0"; exit 1 ;;
esac
