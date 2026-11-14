#!/bin/bash
# Demo "solver" for the dev cluster: prints OpenFOAM-style residuals that
# decay over time, so the portal's Progress chart moves while the job runs.
#   residual-demo.sh <iterations> <seconds per iteration>
set -eu

iterations=${1:-60}
delay=${2:-1}
start=$SECONDS

echo "Residual demo on $(hostname) as $(id -un), in $(pwd)"
for ((t = 1; t <= iterations; t++)); do
    echo "Time = $t"
    awk -v t="$t" 'BEGIN {
        srand(t)
        printf "smoothSolver:  Solving for Ux, Initial residual = %.4e, Final residual = 1e-06, No Iterations 3\n", 0.9 * exp(-t / 12) * (1 + 0.1 * rand())
        printf "smoothSolver:  Solving for Uy, Initial residual = %.4e, Final residual = 1e-06, No Iterations 3\n", 0.6 * exp(-t / 10) * (1 + 0.3 * sin(t))
        printf "GAMG:  Solving for p, Initial residual = %.4e, Final residual = 1e-05, No Iterations 12\n", 0.3 * exp(-t / 16)
    }'
    sleep "$delay"
done
echo "ExecutionTime = $((SECONDS - start)) s"
echo "End"
