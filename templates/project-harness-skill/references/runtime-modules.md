# Harness Runtime Diagnostics

Read this file only when maintaining a local Harness helper or diagnosing a traceback. Normal
project work uses the launchers and stage workflows.

## Ownership

Agents decide project purpose, module meaning, architecture, audit findings, project knowledge,
reference relationships, and Evolution proposals. The runtime protects ids, paths, indexes,
links, Registry records, commit identity, locks, review bindings, and recoverable publication.

The public entries are the `.ps1`, `.cmd`, and `.sh` launchers below
`scripts/project-harness-runtime/`. Project Harness installations expose daily
`doctor`, `audit`, `knowledge`, `change`, `integrate`, and `evolve` operations; project creation and
full migration are performed by the AHO-bundled Creator.
`doctor` diagnoses installation, runtime inventory, links, Registry identity, locks, and recovery.
`audit` adds Change evidence, rule views, project knowledge, citations, drift, and entropy.

## Modules

| Module | Responsibility |
| --- | --- |
| `runtime.mjs` | Self-contained compiled daily Runtime and all deterministic lifecycle owners |
| `cli.mjs` | Command parsing, JSON output, and stable process exit behavior |
| `runtime-manifest.json` | Runtime content hash, supported commands, and distribution identity |
| `harness.ps1` / `harness.cmd` / `harness.sh` | Platform launchers that resolve only their installed Skill root |

## Traceback Route

1. Reproduce through the public launcher and preserve JSON error output.
2. Start with the deepest compiled Runtime frame and map it back to `src/project-harness/**` in the
   AHO source package.
3. Patch the TypeScript module that owns the failed operation; never hand-edit installed
   `runtime.mjs`.
4. Run its failure/recovery test, the full runtime suite, and project Harness independence test.
