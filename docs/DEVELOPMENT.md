# Development Setup

## 1. Current Phase

This repository contains Harness infrastructure, a Phase 1 TypeScript CLI, Phase 2A structured change management, Phase 2B local command run artifacts, Phase 2C Codex read-only proposal capture, Phase 2D memory resolver foundation, Phase 2E opt-in external-local memory, Phase 3A AHO-owned worktree management, Phase 3B change-scoped validation, Phase 3C Auditor proposal gate, and Phase 3D Codex Coder worktree runs.

## 2. Prerequisites

- Git.
- Windows PowerShell 5.1 or PowerShell 7.
- Node.js 20+.
- npm.
- Codex CLI for `aho run codex` manual acceptance.
- Network access when initializing or updating submodules.

## 3. Reference Sources

Initialize submodules when needed:

```powershell
git submodule update --init --recursive
```

Reference source paths:

- `reference-projects/agent-orchestrator/`
- `reference-projects/oh-my-codex/`
- `reference-projects/ecl-harness-engineer/`

## 4. Product Commands

```powershell
npm install
npm run typecheck
npm run lint
npm run test
npm run build
node dist/index.js --help
```

The CLI command name is `aho` when installed from the package bin.

## 5. Structured Change Commands

Use a temporary `AHO_HOME` for manual acceptance if you do not want to touch your real registry:

```powershell
$env:AHO_HOME = "$PWD\.tmp\aho-home"
```

Core flow:

```powershell
node dist/index.js project add ..\aho-test-project --name aho-test
node dist/index.js harness init aho-test
node dist/index.js change new aho-test --title "Add sample workflow" --body "Raw user request"
node dist/index.js change status aho-test --json
node dist/index.js change close aho-test
```

`change close` blocks while `reviews/review.md` is `Status: pending`. Change it to `Status: approved` or `Status: approved-with-notes` to close after reviewing the artifacts.

## 6. Memory Diagnostics

Memory diagnostics show how AHO resolves a project's durable memory layout. This is diagnostic only; `harness audit` remains the readiness gate.

```powershell
node dist/index.js memory status aho-test
node dist/index.js memory status aho-test --json
```

`repo-local` remains the default and compatibility mode. `external-local` is available as an opt-in personal mode. `remote` remains planned/unsupported.

External-local initialization keeps durable memory outside the target repository:

```powershell
node dist/index.js project add ..\aho-test-project --name aho-test
node dist/index.js harness init aho-test --memory external-local
node dist/index.js memory status aho-test --json
```

The target repository keeps only `AGENTS.md`, `.agent-harness/project.json`, and `.agent-harness/.gitignore`. Durable docs, Harness files, scripts, changes, and runs live under AHO home.

## 7. Local Command Run Commands

Runs require a registered, managed project with exactly one active change. Commands are executed directly in the target project root with executable-plus-arguments semantics; shell pipes, redirects, and interactive sessions are not supported.

```powershell
node dist/index.js run start aho-test -- npm run test
node dist/index.js run list aho-test --json
node dist/index.js run show aho-test <run-id> --json
```

Run artifacts are written under the target project:

```text
.agent-harness/runs/{run-id}/
  run.json
  context.md
  events.jsonl
  stdout.log
  stderr.log
```

For external-local projects, run artifacts are written under the resolved memory root and `run.json` uses `artifacts.base: "memory-root"`.

## 8. Worktree Commands

Worktrees require a registered, managed project. `worktree create` requires exactly one active change. `list`, `show`, and `remove` do not require an active change so old worktrees can be cleaned up after archive.

```powershell
node dist/index.js worktree create aho-test --json
node dist/index.js worktree list aho-test --json
node dist/index.js worktree show aho-test <worktree-id> --json
node dist/index.js worktree remove aho-test <worktree-id>
```

Real Git checkouts are stored under AHO home. Metadata is stored under the active memory root. Dirty worktrees cannot be removed unless `--force` is provided.

Local command runs can execute inside a new AHO-managed worktree:

```powershell
node dist/index.js run start aho-test --worktree -- npm test
```

`run start --worktree` records `executionMode: "worktree"` and keeps the checkout after completion for inspection.

## 9. Validation Commands

Validation is mechanical evidence for the current active change. It does not replace review or human confirmation.

```powershell
node dist/index.js validate run aho-test
node dist/index.js validate run aho-test --worktree
node dist/index.js validate run aho-test --worktree <worktree-id>
node dist/index.js validate status aho-test --json
node dist/index.js validate list aho-test --json
node dist/index.js validate show aho-test <validation-id> --json
```

Profile resolution:

1. `harness/config/environment.json`
2. package fallback for `typecheck`, `lint`, `test`, and `build`

Validation artifacts are written under the active memory root:

```text
runs/{run-id}/validation.json
runs/{run-id}/commands/*.stdout.log
runs/{run-id}/commands/*.stderr.log
```

The close gate blocks the latest failed validation for the current change. Missing validation is warning-only in Phase 3B.

## 10. Code Commands

Code runs use Codex workspace-write mode in a new AHO-owned worktree. They produce implementation proposals and diff artifacts, but do not apply, merge, validate, audit, or close the change.

```powershell
node dist/index.js code run aho-test --prompt "Implement only the requested README Usage section."
node dist/index.js code run aho-test --task T-001 --prompt-file .\coder-extra.md --json
node dist/index.js code status aho-test --json
node dist/index.js code list aho-test --json
node dist/index.js code show aho-test <run-id> --json
```

Coder artifacts are written under the active memory root:

```text
runs/{run-id}/run.json
runs/{run-id}/context.md
runs/{run-id}/prompt.md
runs/{run-id}/codex-events.jsonl
runs/{run-id}/last-message.md
runs/{run-id}/diff.patch
runs/{run-id}/diff-stat.txt
runs/{run-id}/implementation.md
```

After a successful Coder proposal, use the same worktree id for authoritative validation and audit:

```powershell
node dist/index.js validate run aho-test --worktree <coder-worktree-id>
node dist/index.js audit run aho-test --worktree <coder-worktree-id>
```

Dirty Coder worktrees block `change close`. Apply/discard/merge remains a later phase.

## 11. Audit Commands

Audit is semantic review evidence for the current active change. It does not replace human confirmation.

```powershell
node dist/index.js audit run aho-test
node dist/index.js audit run aho-test --worktree <worktree-id>
node dist/index.js audit status aho-test --json
node dist/index.js audit list aho-test --json
node dist/index.js audit show aho-test <audit-id> --json
node dist/index.js audit accept aho-test <audit-id>
```

Audit artifacts are written under the active memory root:

```text
runs/{run-id}/audit.json
runs/{run-id}/audit.md
runs/{run-id}/diff.patch
runs/{run-id}/diff-stat.txt
runs/{run-id}/last-message.md
```

`audit run` is read-only and proposal-only. `audit accept` is the explicit human confirmation command that writes an approved audit into `reviews/review.md`.

The close gate blocks only the latest `blocked` audit for the current change. Missing audit and failed/unparseable audit are warning-only in Phase 3C.

## 12. Codex Read-Only Proposal Runs

Codex runs require a registered, managed project with exactly one active change. AHO reuses the user's local Codex CLI login and configuration. It does not run `codex login`, read tokens, or modify `~/.codex`.

```powershell
node dist/index.js run codex aho-test --prompt "Read the run context and propose an implementation plan. Do not edit files."
node dist/index.js run codex aho-test --prompt-file .\prompt.md --json
```

`run codex` is proposal-only. It uses Codex read-only sandboxing when supported and records failures as artifacts instead of falling back to writable or full-auto modes.

Additional artifacts:

```text
.agent-harness/runs/{run-id}/
  prompt.md
  codex-events.jsonl
  last-message.md
```

## 13. Harness Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
```
