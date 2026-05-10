# Project Status

## Current State

Phase 1 is complete: the TypeScript CLI can register projects and manage Core Harness files.

Last archived change:

`harness/changes/archive/20260510-phase-1-cli/summary.md`

## Completed In This Phase

- Git repository initialized.
- Reference projects included as submodules.
- Core Harness docs, scripts, templates, environment contract, and CI created.
- Harness verification passed.

## Current Work

- Single-package TypeScript CLI named `aho` implemented.
- `project add/list/status` implemented.
- `harness audit/init/reindex` implemented.
- Keep Phase 1 free of worktree, Codex runtime, Web UI, and SQLite.
- Manual CLI acceptance passed with an isolated temporary Git project and temporary `AHO_HOME`.

## Verification

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product build, test, typecheck, and lint are available through npm scripts.

## Next Resume Point

Create a new structured change for ECL change workflow commands or Codex `exec` task runs.

## Residual Risks

- Reference submodules may need pin updates before product implementation begins.
- PowerShell scripts are intentionally minimal but usable; later product code can replace them with TypeScript equivalents.
