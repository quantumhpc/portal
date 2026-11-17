# QuantumHPC Portal

An open-source web portal for HPC clusters. Users sign in with their cluster
account to submit and monitor Slurm or PBS jobs, manage files, launch
interactive desktops and watch software-license usage, all without a terminal.

![Portal dashboard: jobs in the queue, free cores, license usage and notifications](images/dashboard-light.png)

- **Easy for engineers.** Pick an application, fill a short form, watch the
  solver converge on a live chart.
- **Customised live, in the browser.** Applications, forms, logos,
  progress-chart parsers and site settings are edited from the admin pages
  and apply on save, with no restart.
- **Runs as the real OS user.** PAM sign-in, and every job, file operation
  and remote desktop runs under the user's own uid/gid.

## Features

- **[Start a job](#start-a-job)**: batch jobs and remote desktops from a short
  form, run again, saved set-ups.
- **Monitor jobs**: queue and status, output files, live progress charts,
  hold, release and cancel.
- **Cluster overview**: nodes, partitions or queues, CPU, memory and GPU usage.
- **[Data](#data)**: a file manager for home and scratch.
- **[Licenses](#licenses)**: live FlexLM, RLM and LM-X usage.
- **[Job templates](#job-templates)**: add applications and build their forms
  from the browser, with a [progress parser](#progress-parser) for each.
- **Administration**: users, admins and site settings from the browser.

Supported schedulers: **Slurm** and **PBS Pro / OpenPBS**.

## Start a job

**Start a job** lists the applications by domain, with search. Open one and
fill in its form: input file, version, cores, time limit and the options
the admin added. The portal writes the job script and submits it as you.

An application runs in one or both ways:

| | Batch job | Remote desktop |
| --- | --- | --- |
| What runs | The solver, with no display | A desktop (TurboVNC, TigerVNC or VirtualGL) on a compute node, with the application open in it |
| Input file | Usually required | None |
| You follow it in | **Jobs** and the job page: output files, progress chart | **Interactive**: **Connect** opens the desktop in the browser |
| Use it for | Long solver runs | Pre- and post-processing, GUIs, meshing |

Remote desktops need nothing installed on the user's machine. Set-up is in
[Remote desktop](remote-desktop.md).

### Run the same job again

- **Run again.** In **Jobs → My submissions**, or at the top of a job's page,
  *Run again* opens the application form filled in with that job's values.
- **Saved set-ups.** In any job form, *Save set-up* keeps the form values under
  a name. They appear at the top of **Start a job**, one click from a filled-in form.

Input files are not kept: attach them again before you submit. Saved set-ups
are private to the user who saved them.

## Data

**Data management** is a file manager for the user's home and scratch
folders:

- browse, create folders, copy, move, rename and delete;
- upload large files, resumed after a dropped connection;
- download files, or whole folders as a tar archive;
- view and edit text files, such as input decks and job scripts.

Every action runs as the user, so normal file permissions and quotas apply.
Scratch folders are set in `config.json` ([Configuration](CONFIGURATION.md)).

## Licenses

**License usage** shows each license feature with its total, in use and
available count, read live from FlexLM, RLM or LM-X servers. Users can
check that a license is free before they submit. The dashboard shows the
same usage at a glance.

The admin lists the servers in `lic_servers` and points the portal to the
vendor tools (`lmutil`, `rlmutil`, `lmxendutil`), which are not shipped
([Configuration](CONFIGURATION.md#license-server-monitoring)).

## Job templates

Admins add an application and build its form under **Admin → Applications**,
with no restart:

- **Details**: name, category, logo, batch and/or remote desktop.
- **Fields**: text, choices, tick boxes, yes/no and input files, plus
  ready-made options from **Add to form** (time limit, memory, nodes, tasks,
  GPUs, modules…).
- **Parameters**: the command built from `VAR.<field>` placeholders, one
  binary path per version, defaults and prologue commands such as
  `module load`.
- **Preview** the form, then save. Users see it on their next page load.
- **Export** an application as one JSON file, and **Import** it on another site.

Edits are stored in the site folder, never in the shipped templates, so
upgrades keep them. The step-by-step guide is
[Add an application](ADD-AN-APP.md).

### Progress parser

A parser reads the job output while it runs and draws the **Progress** tab:
residual charts, summary values and a finished or failed banner.

- **Built-in** parsers cover Fluent, CFX, Mechanical, Abaqus, OptiStruct,
  STAR-CCM+ and OpenFOAM.
- A **pattern recipe** needs no code: regular expressions for the iteration,
  the series and the end state, written and tested on a real log in the
  browser.
- A **JavaScript file**, placed on the server by an admin, handles output
  that is not line-based.

See [Parsers](PARSERS.md), and the [recipe walkthrough](ADD-AN-APP.md#5-progress-chart).

![Parser editor: a progress chart drawn from a pasted OpenFOAM log](images/parser-editor-light.png)

## Guides

- **[Install](INSTALL.md)**: production install, reverse proxy, PAM, upgrades.
- **[Add an application](ADD-AN-APP.md)**: a new solver in five minutes, from the browser.
- **[Parsers](PARSERS.md)**: progress charts from pattern recipes or JavaScript.
- **[Configuration](CONFIGURATION.md)**: every `config.json` setting and environment variable.
- **[Remote desktop](remote-desktop.md)**: interactive sessions on compute nodes.
- **[Architecture](ARCHITECTURE.md)**: how the code is organised.

Source code, issues and discussions are on
[GitHub](https://github.com/quantumhpc/portal).
