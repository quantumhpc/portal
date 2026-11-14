# Contributing to QuantumHPC Portal

Thanks for your interest! The portal is maintained by people who run HPC
clusters, for people who run HPC clusters. Contributions of every size
help: a typo fix, a new application template, a scheduler backend, or a
bug report with a clear reproduction.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug or request a feature.** Use the
  [issue templates](https://github.com/quantumhpc/portal/issues/new/choose).
  Search existing issues first.
- **Add or improve an application template.** Templates under `apps/templates/`
  are JSON, and you don't need TypeScript to contribute one.
- **Support another scheduler.** LSF, SGE/UGE, HTCondor and Flux are all wanted;
  see `lib/hpc/slurm` and `lib/hpc/pbs` for the shape of a backend.
- **Improve the docs**, especially install notes for your distro or site setup.
- **Pick up an issue** labelled
  [`good first issue`](https://github.com/quantumhpc/portal/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/quantumhpc/portal/labels/help%20wanted).
  Tightening the remaining `any` types (lint warnings) is a good warm-up.

For anything larger than a small fix, please open an issue first so we can
agree on the approach before you invest time.

## Development setup

You don't need a cluster. The repository ships mock `sbatch`/`squeue`/`qsub`/…
commands driven by JSON scenarios.

**Prerequisites:** Linux or macOS, Node.js ≥ 20.9, and a C++ toolchain with
PAM headers for the native modules:

```bash
# Debian/Ubuntu
sudo apt-get install -y build-essential python3 libpam0g-dev
# RHEL/Fedora
sudo dnf install -y gcc-c++ make python3 pam-devel
# macOS: Xcode command line tools (PAM headers included)
```

Then:

```bash
git clone https://github.com/<you>/portal.git && cd portal
npm ci
./dev/start-dev.sh     # writes .env.local + config/config.json, seeds dev/qhpc.sqlite
npm run dev            # http://localhost:3000
```

Log in with your **OS username**. In dev mode PAM is off, so any password is
accepted, and your user is an admin. Read [dev/README.md](dev/README.md) for
the scheduler mocks, scenarios (`busy`, `empty`, `error`…), PBS mode,
the SSH-mode mock cluster (Docker) and MongoDB mode.

## Checks

Run these before opening a pull request; CI runs the same ones:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (must have 0 errors)
npm test            # vitest
npm run build       # production build
```

**New code must include tests**, in `__tests__/` folders next to the code you
change. Documentation-only changes and refactors that don't change behaviour
are exempt. If you can't add a test, say why in the PR, describe how you tested
by hand, and point reviewers at the risky parts. Scheduler-output parsing and
anything security-related (authentication, running commands as users, file
paths) always needs tests.

## Pull requests

1. Fork the repository and create a branch from `main`, named
   `feature/<short-name>-<issue#>` or `bug-fix/<short-name>-<issue#>`.
2. Keep each PR focused on one change. Separate refactors from behaviour changes.
3. Write a clear description: what, why, and how you tested it. Reference the
   issue in the description (`Fixes #123`), not the title. Include screenshots
   for UI changes.
4. Make sure the checks above pass and every commit is signed off (see below).
5. A maintainer reviews every PR and may ask for tests, docs, a split into
   smaller PRs or style changes. We try to give a first response within a week.

Commit messages: an imperative summary line (≤ 72 characters), a blank line,
then the why.

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line. By adding it you certify the
[Developer Certificate of Origin](https://developercertificate.org/): you wrote
the change, or otherwise have the right to submit it under the project's
license. If your employer owns what you write (common at universities and HPC
centres), make sure they allow you to contribute.

```bash
git commit -s -m "Fix squeue parsing for array jobs"
# forgot? sign the last commit, or every commit on your branch:
git commit --amend -s --no-edit
git rebase --signoff main
```

The sign-off must use your real name and an email you can be reached at. A
check on each PR blocks unsigned commits.

## AI-assisted contributions

You may use AI tools, but **you** must understand, review and take
responsibility for everything you submit, and be able to explain it in review.
Contributions without meaningful human involvement will be closed. Bots and AI
agents may not open PRs, issues or comments on someone's behalf.

## Security-sensitive code

The portal runs as root and acts on behalf of users. Take extra care in:

- `lib/hpc/exec.ts`: every command runs with the user's uid/gid and a
  sanitised environment. Never pass user input through a shell without quoting.
- `lib/files/`: resolve and validate paths, and never let a user reach outside
  directories they are allowed to use.
- `lib/auth/`: PAM authentication and sessions.

Report vulnerabilities privately (see [SECURITY.md](SECURITY.md)). Don't
open public issues for them.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE). The project name and logos are covered by the
[trademark policy](TRADEMARKS.md).
