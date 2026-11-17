# Security policy

The portal authenticates users and runs commands on their behalf as root on
cluster login nodes, so we take security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Report vulnerabilities privately
through GitHub:
[**Report a vulnerability**](https://github.com/quantumhpc/portal/security/advisories/new)
(Security tab → "Report a vulnerability"). If you can't use GitHub, email
**security@quantumhpc.com** with "SECURITY" in the subject.

Please include:

- the affected version or commit,
- a description of the issue and its impact (for example: privilege
  escalation, reading another user's files, authentication bypass),
- steps to reproduce or a proof of concept,
- your site configuration if relevant (scheduler, `method`, PAM setup), with
  secrets removed.

We aim to acknowledge reports within **3 working days** and to agree on a
disclosure timeline with you, typically within 90 days. We credit reporters in
the release notes unless you prefer otherwise.

## Supported versions

Security fixes go into the latest release. Please upgrade before reporting
if you can.

## Hardening checklist for operators

- Serve the portal only through a TLS reverse proxy. It should listen on `127.0.0.1`.
- Keep `use_pam: true`. Never set `USE_PAM=false` outside local development.
- Use a unique, random `NEXTAUTH_SECRET` (≥ 32 characters) in a root-only
  (`0600`) environment file.
- Restrict who may log in with your PAM service (`/etc/pam.d/qhpc-portal`),
  for example with `pam_succeed_if` or `pam_access`.
- Keep Node.js and the portal up to date.
