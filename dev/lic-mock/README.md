# License-manager mocks

Fixture outputs for `lib/license-managers/` (FlexLM, RLM, LM-X), so the
Licensing dashboard renders real-looking data with no license server present.

Unlike the PBS/SLURM mocks, these are **not** executable binaries. A license
query is a stateless read, and each parser already has a built-in mock hook: a
`["test", <path>]` URL makes it read the file directly instead of spawning the
vendor binary (`lmutil` / `rlmutil` / `lmxendutil`). The fixtures below are
captured in each tool's native format and parse through the real parser code.

```
lic-mock/
  flex/ansys.output   FlexLM  lmstat -a   (ansyslmd: anshpc, ansys, cfd_base, aa_r=error)
  flex/star.output    FlexLM  lmstat -a   (cdlmd:    ccmpsuite, hpcdomains)
  rlm/virtuallab.out  RLM     rlmstat -a  (vlabd:    vlmotion, vlacoustics, vldurability)
  lmx/altair.out      LM-X    -licstat    (ALTAIR:   HWAIFEM, HWU)
```

Wired in `config/config.json` under `lic_servers`:

```json
"ansys": { "type": "flexlm", "url": ["test", "./dev/lic-mock/flex/ansys.output"] }
```

The pools are tuned to exercise every `progressType` band the dashboard colors
by (`danger` ≤33% free, `warning` ≤66%, `info` above), and `aa_r` covers the
FlexLM error-feature path.

## Pointing at a real server

Drop the `["test", …]` wrapper and give the plain server string the vendor
binary expects (FlexLM/RLM: `port@host`; LM-X: `port@host` split on `@`). The
binary/command come from `config/managers/{flexlm,rlm,lmx}_config.json`.

```json
"ansys": { "type": "flexlm", "url": "1055@licsrv-ansys" }
```
