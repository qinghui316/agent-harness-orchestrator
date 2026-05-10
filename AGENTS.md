# Agent Harness Orchestrator Agent Guide

Agent Harness Orchestrator is a local-first, change-driven AI coding orchestrator with repo-local Harness and controlled evolution.

## 1. Current Phase

This repository is in Phase 1: TypeScript CLI for project registration and Harness management.

The current active change is:

`harness/changes/active/phase-1-cli/`

## 2. Context Loading Order

1. Read this `AGENTS.md`.
2. Read `docs/ECL.md`.
3. If `harness/changes/active/` contains a change, read its `summary.md`, `spec.md`, `plan.md`, and `tasks.md`.
4. If no active change exists and `harness/evolution/pending.md` exists, read it before `docs/STATUS.md`.
5. Read `docs/STATUS.md`.
6. Read task-specific docs under `docs/`.

Archive history is loaded selectively through `docs/STATUS.md` paths or `harness/changes/INDEX.json`. Start with archived `summary.md` only.

## 3. Project Sources

| Document | Purpose |
| --- | --- |
| `docs/PRODUCT.md` | Product requirements and MVP boundaries |
| `docs/ARCHITECTURE.md` | Architecture and major decisions |
| `docs/ECL.md` | Change lifecycle and Harness rules |
| `docs/DEVELOPMENT.md` | Local commands and verification |
| `docs/references/index.md` | Reference source maps |

## 4. Work Classification

Small changes are local, low-risk edits such as typos, comments, or narrowly scoped documentation updates.

Structured changes include cross-file behavior, APIs, architecture, validation chains, Harness updates, reference source updates, or unclear requirements. Structured changes must use active change files.

If an active change exists, keep using it. Do not create a second active change.

## 5. Structured Change Gate

Before implementation, structured work needs:

- `spec.md` for WHAT and WHY.
- `plan.md` for HOW and planning-discovered gaps.
- `tasks.md` for executable steps.
- `reviews/review.md` for independent review results.

High-impact unknowns must be recorded as `[NEEDS CLARIFICATION: ...]` and resolved before implementation.

## 6. Reference Projects

Reference source code is included as git submodules under `reference-projects/`.

| Reference | Use For | Local Path |
| --- | --- | --- |
| Agent Orchestrator | Worktrees, dashboard, runtime adapters, flat-file state | `reference-projects/agent-orchestrator/` |
| oh-my-codex | Codex workflow, hooks, sessions, agent organization | `reference-projects/oh-my-codex/` |
| ecl-harness-engineer | ECL/Harness protocol baseline | `reference-projects/ecl-harness-engineer/` |

Use `docs/design-docs/ref-*.md` as maps before reading reference source. Do not copy reference architecture blindly.

## 7. Current Verification

Run Harness verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

## 8. Task-To-Artifact Map

| Task Type | Start Here | Expected Artifact |
| --- | --- | --- |
| Product requirement | `docs/PRODUCT.md` | Updated spec or new active change |
| Architecture decision | `docs/ARCHITECTURE.md` | Decision note in `plan.md` |
| Harness rule change | `docs/ECL.md` | Structured change and lint update |
| Reference project research | `docs/references/index.md` | Updated `docs/design-docs/ref-*.md` |
| Current handoff | `docs/STATUS.md` | Resume or close active change |

## 9. Reference Source Rules

Read reference maps before source. Treat reference projects as evidence, not implementation instructions.

Reference updates are structured changes. Record the old commit, new commit, reason, implications, and verification.

Do not edit reference submodule source as part of this product repository. If local exploration changes a submodule, discard or isolate it in the submodule itself.

## 10. Planned Product Boundaries

Phase 1 implements a TypeScript CLI for project registration and Harness management.

Phase 2 will add Codex `exec` task runs.

Phase 3 will add a local dashboard.

Phase 4 will evaluate interactive terminal sessions.

## 11. File Safety

- Preserve user changes. Do not revert unrelated edits.
- Use UTF-8 for source and documentation.
- PowerShell reads and writes must explicitly use UTF-8.
- Do not hand-edit `harness/changes/INDEX.json`; regenerate it with `scripts/harness-change.ps1 reindex`.
- Do not auto-apply Harness evolution from `pending.md`; use evidence, proposal, independent review, validation, and results logging.

## 12. Not In Scope Yet

- No Web UI.
- No Codex runtime execution.
- No automatic merge.
- No cloud sync or multi-user permissions.

## 13. Next Phase

After Phase 1 is complete, create a structured change for Codex `exec` task runs.
