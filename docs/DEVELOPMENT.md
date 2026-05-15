# Development Setup

## 1. Current Phase

This repository contains Harness infrastructure, a Phase 1 TypeScript CLI, Phase 2A structured change management, Phase 2B local command run artifacts, Phase 2C Codex read-only proposal capture, Phase 2D memory resolver foundation, Phase 2E opt-in external-local memory, Phase 3A AHO-owned worktree management, Phase 3B change-scoped validation, Phase 3C Auditor proposal gate, Phase 3D Codex Coder worktree runs, Phase 3E worktree apply/discard gates, Phase 4A Spec-Test evidence mapping, Phase 4B Spec-Test evidence proposals, Phase 4C Codex-assisted passing Spec-Test generation, Phase 4D Spec-Test drift readiness, Phase 4E Spec/Planner proposal gates, Phase 5A Workbench Snapshot read models, Phase 5B Workbench stream replay / structured approval actions, Phase 5C local Workbench GUI shell, and Phase 5D Topic chat with Codex plan-mode workflow actions.

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

## 8. Workbench Snapshot Commands

Workbench commands build GUI-ready read models from canonical artifacts. They do not write files, call Codex, or advance workflow state.

```powershell
node dist/index.js workbench snapshot aho-test --json
node dist/index.js workbench snapshot aho-test --topic <change-id> --json
node dist/index.js workbench stream aho-test <run-id> --json
node dist/index.js workbench approvals aho-test --json
node dist/index.js workbench approvals aho-test --topic <change-id> --json
node dist/index.js workbench topics aho-test --json
node dist/index.js workbench topic aho-test <change-id> --json
node dist/index.js workbench roles aho-test --json
node dist/index.js workbench serve --host 127.0.0.1 --port 4317 --open
node dist/index.js workbench serve aho-test --host 127.0.0.1 --port 4317 --open
```

`snapshot` returns:

- project and memory status;
- Topic(Change) list;
- selected Topic detail;
- thread events;
- agent loop run summaries;
- approval inbox items;
- structured approval actions;
- bundled role summaries;
- `harnessGaps` for workspace/session/subagent structures that are still missing or partial.

`stream` is replay-only. It reads existing run artifacts and returns metadata, parsed events, artifact pointers, bounded previews, and diagnostics for missing artifacts. It does not start a run or provide live WebSocket/SSE streaming.

`approvals` is a derived view. It returns project-level approval items by default, with optional Topic filtering for display. Mutating actions include structured command metadata and require explicit confirmation.

The snapshot is a derived view for future GUI work. It is not a new source of truth.

`serve` starts the local browser Workbench. Without a project argument, it still opens the three-pane Workbench shell; project onboarding lives in the left sidebar. A user can add an existing local project with the native folder picker, create a new local project folder from a selected parent directory, initialize Harness memory after explicit confirmation, and then inspect the Topic-centered Workbench. With a project argument, it direct-opens that project. The server serves the Vite-built static UI from `dist/web` and exposes local JSON APIs for project onboarding, native folder selection, snapshot, topics, replay stream packets, approvals, and allowlisted approval actions. Mutating actions require `confirm: true`; the server does not accept arbitrary shell commands.

The Phase 5C GUI starts as replay-only. The Agent Loop surface is designed for future live streaming, but run detail data still comes from existing artifacts through `workbench stream`.

Phase 5D adds project-scoped Workbench APIs for Topic chat and workflow actions:

```text
POST /api/projects/:projectId/workbench/topics
GET  /api/projects/:projectId/workbench/topics/:changeId/messages
POST /api/projects/:projectId/workbench/topics/:changeId/messages
GET  /api/projects/:projectId/workbench/topics/:changeId/messages/stream
POST /api/projects/:projectId/workbench/actions
GET  /api/projects/:projectId/workbench/actions/:actionRunId
GET  /api/projects/:projectId/workbench/actions/:actionRunId/events
```

Ordinary chat messages are appended to the active Topic's `thread.jsonl` and answered through Codex read-only mode. If Codex exposes a session id in JSONL output, AHO stores it in Topic runtime metadata and attempts `codex exec resume <session-id>` for later ordinary chat. If session resume is unavailable, AHO rebuilds context from durable Topic memory. The Codex session is runtime continuity only; accepted `spec.md`, `plan.md`, `tasks.md`, review, run, validation, audit, apply, and close artifacts remain the workflow sources of truth.

`POST /api/projects/:projectId/workbench/actions` only accepts allowlisted action types such as `chat.ask`, `change.spec.propose`, `change.spec.accept`, `change.plan.propose`, `change.plan.accept`, `code.run`, `validate.run`, `audit.run`, and `spec-test.drift`. Mutating actions still require `confirm: true`; the server does not accept arbitrary shell commands.

## 9. Worktree Commands

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

## 10. Validation Commands

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

## 11. Spec-Test Mapping Commands

Spec-test mappings connect Acceptance Criteria to test or validation evidence. They are explicit linked evidence, not proof that the AC is fully covered.

```powershell
node dist/index.js spec-test link aho-test --ac AC-001 --file test\pricing.test.js --test-name "normal customers pay subtotal" --command test
node dist/index.js spec-test link aho-test --ac AC-002 --command build
node dist/index.js spec-test status aho-test --json
node dist/index.js spec-test status aho-test --worktree <worktree-id> --json
node dist/index.js spec-test check aho-test --json
node dist/index.js spec-test drift aho-test --json
node dist/index.js spec-test drift aho-test --worktree <worktree-id> --json
node dist/index.js spec-test check aho-test --strict --json
node dist/index.js spec-test unlink aho-test --ac AC-001 --command test
```

`spec-tests.json` lives in the active change directory. File paths are repo-relative logical paths. `testName` is recorded for human review only; AHO does not parse test runner output in Phase 4A.

Missing linked evidence is warning-only. A linked file that does not exist is blocking because it is bad evidence.

`spec-test drift` is a deterministic readiness check. It reports whether each AC is `ok`, `missing`, `invalid`, `stale`, `failed`, or `unknown` against the selected latest validation and root. `stale` is risk-based and may come from mtime comparisons; it is not proof that the implementation is wrong. `spec-test check --strict` exits non-zero for invalid, stale, or failed accepted evidence, but still treats missing evidence as warning-only.

Spec-test proposal runs ask Codex to inspect existing tests and propose candidate evidence. Codex output is proposal-only; it does not edit `spec-tests.json`.

```powershell
node dist/index.js spec-test propose aho-test --json
node dist/index.js spec-test propose aho-test --worktree <worktree-id> --prompt "Prefer existing regression tests." --json
node dist/index.js spec-test proposal list aho-test --json
node dist/index.js spec-test proposal show aho-test <proposal-id> --json
node dist/index.js spec-test proposal accept aho-test <proposal-id> --ac AC-001 --ref ev-001
node dist/index.js spec-test proposal accept aho-test <proposal-id> --all-existing
```

`proposal accept` is the human confirmation command. In Phase 4B it only accepts `source-root` + `existingEvidence` candidates. Worktree-only evidence, suggested new tests, open questions, and unknown evidence are skipped or rejected. AHO still uses deterministic `spec-test link` logic for the actual write to `spec-tests.json`.

## 12. Spec-Test Generation Commands

Spec-test generation asks Codex to create a passing test evidence proposal in a new AHO-owned worktree. It is test-only, proposal-only, and does not edit `spec-tests.json`.

```powershell
node dist/index.js spec-test generate aho-test --missing --prompt "Add minimal tests for missing AC evidence." --json
node dist/index.js spec-test generate aho-test --ac AC-001 --ac AC-002 --json
```

Generation behavior:

- `--missing` selects only ACs with no linked evidence.
- `--ac` and `--missing` are mutually exclusive.
- Codex runs with workspace-write in an AHO-owned worktree.
- The source repo is read/context only until explicit `worktree apply`.
- Diffs outside test-like paths cause the generator run to fail and keep artifacts for diagnosis.
- Generated tests must pass validation and audit before apply.
- After apply, use `spec-test propose` and `spec-test proposal accept` to write accepted evidence mappings.

Typical flow:

```powershell
node dist/index.js spec-test status aho-test --json
node dist/index.js spec-test generate aho-test --missing --json
node dist/index.js validate run aho-test --worktree <generated-worktree-id> --json
node dist/index.js audit run aho-test --worktree <generated-worktree-id> --json
node dist/index.js audit accept aho-test <audit-id> --json
node dist/index.js worktree preview aho-test <generated-worktree-id> --json
node dist/index.js worktree apply aho-test <generated-worktree-id> --commit --message "add spec-test evidence"
node dist/index.js spec-test propose aho-test --json
node dist/index.js spec-test proposal accept aho-test <proposal-id> --all-existing --json
node dist/index.js spec-test status aho-test --json
```

Generator artifacts are written under the active memory root:

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

Phase 4C does not support accepted red tests, CI drift gates, or automatic proof of AC coverage. Phase 4D adds local drift diagnostics only; CI enforcement remains future work.

## 13. Spec And Plan Proposal Commands

Spec and Planner agents are read-only proposal agents. They do not write canonical ECL files until the user runs an explicit accept command.

```powershell
node dist/index.js change spec propose aho-test --prompt "Clarify this raw request into testable ACs." --json
node dist/index.js change spec proposal list aho-test --json
node dist/index.js change spec proposal show aho-test <proposal-id> --json
node dist/index.js change spec accept aho-test <proposal-id> --json

node dist/index.js change plan propose aho-test --json
node dist/index.js change plan proposal list aho-test --json
node dist/index.js change plan proposal show aho-test <proposal-id> --json
node dist/index.js change plan accept aho-test <proposal-id> --json
```

`spec propose` reads the active Change summary/raw request, current `spec.md` draft, and bounded project docs. It produces `spec-proposal.json`, `spec-proposal.md`, `prompt.md`, `last-message.md`, Codex JSONL, and run logs. The proposal must contain testable `AC-xxx` IDs before it can be accepted.

`plan propose` requires accepted/manual `spec.md` with at least one parseable AC. It produces `plan-proposal.json` and `plan-proposal.md`; accepted tasks must use `T-xxx` IDs and `Covers: AC-xxx` mappings. `plan accept` writes `plan.md` and `tasks.md`, then rebuilds `ac-map.json`.

Both accept commands are stale-safe: if the target file changed after proposal generation, accept aborts and the user must re-run the proposal. Accepting a proposal does not update review status, run code, validate, audit, apply, close, or accept spec-test evidence.

## 14. Code Commands

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

Dirty active Coder worktrees block `change close`. Use validation, audit, audit accept, and worktree apply before closing an implemented change.

## 15. Apply / Discard Commands

Apply is the explicit human confirmation gate that adopts a validated and audited worktree diff into the source repo. It is not merge, push, PR, or close.

```powershell
node dist/index.js worktree preview aho-test <worktree-id> --json
node dist/index.js worktree apply aho-test <worktree-id>
node dist/index.js worktree apply aho-test <worktree-id> --commit --message "apply accepted change"
node dist/index.js worktree discard aho-test <worktree-id>
```

Apply requires:

- source repo is clean
- source `HEAD` still matches the worktree base commit
- current worktree diff is non-empty
- latest passed validation matches the same `worktreeDiffHash`
- latest approved audit matches the same `worktreeDiffHash`
- `reviews/review.md` references the same accepted `Audit ID`

`worktree apply` without `--commit` leaves source repo changes uncommitted. `change close` blocks until the source repo is clean. `worktree discard` only removes an unapplied proposal checkout; it does not revert already applied source changes.

## 16. Audit Commands

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

## 17. Codex Read-Only Proposal Runs

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

## 18. Harness Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
```
