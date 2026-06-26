# Agent Harness Orchestrator Agent Guide

Agent Harness Orchestrator (AHO) is a local-first Agent Development OS with a Spec-Anchored Harness Kernel. It turns natural-language development demand into project-scoped conversations, durable Change/Workpad/TaskGraph state, constrained agent runs, validation/audit evidence, and human-gated apply/landing decisions.

## 1. Current Handoff

- Current date: 2026-06-27.
- Active change: none.
- Pending Harness evolution: `harness/evolution/pending.md`.
- Latest archived product change:
  `harness/changes/archive/20260627-workbench-desktop-cc-gui-aligned-home-and-conversation-entry-v1/summary.md`.
- Latest archived docs/reference change:
  `harness/changes/archive/20260626-document-desktop-cc-gui-reference-map-and-product-layer-roadmap/summary.md`.
- Latest archived reference policy correction:
  `harness/changes/archive/20260626-desktop-cc-gui-local-only-reference-correction/summary.md`.
- Latest completed Harness evolution:
  `harness/changes/archive/20260626-auto-evolve-post-orchestration-map-window/summary.md`
  (`docs_merge`; subagent Aquinas score 86; no ECL/template/lint/product
  runtime change).
- Recent detailed archives are discoverable through `docs/STATUS.md` and
  `harness/changes/INDEX.json`; keep per-run ids, E-drive paths, patch hashes,
  and gate sequences archive-only.

Current baseline:

- Local manual-gated Workbench has real acceptance through planning, code,
  validation/audit, human apply, and close/archive.
- Workbench conversation transcripts now use cursor-incremental SQLite message
  paging by default, bounded virtual rendering, long-message folding, and
  `@chenglou/pretext` height estimates with fallback. Synthetic 100k / 500k
  message pressure acceptance passed without durable large fixtures. Workflow
  truth remains unchanged.
- Workbench `Agent 编排图` now renders a Rudder-style read-only orchestration
  canvas with avatar cards, status dots, SVG edges, pan/zoom/fit controls, and
  stage-based layout for local loop, rework, scheduler worker branch/join,
  IntegrationCheck, landing, and terminal nodes. The graph is a projection only
  and does not execute actions or replace `confirmationQueue.primary`.
- The right confirmation surface defaults to a compact collapsed rail with a
  pending count badge. Expanding it shows the existing confirmation pane; the
  rail is frontend-only UI state and does not execute actions.
- Phase 1 desktop product-layer entry now follows the `desktop-cc-gui`
  reference more closely for Harness mode: a sparse project/conversation
  sidebar plus a centered "create anything" composer. The composer has a real
  Codex-style `请求批准` / `完全访问权限` mode toggle; unsupported toolbar,
  recent-session, and fake dropdown controls are hidden until implemented.
  Codex diagnostics are advanced settings, not the main product home.
- Planning prefers Codex Plan Mode proposal capture; plan confirmation remains
  human.
- `请求批准` and scoped `完全访问权限` share the same local Goal Loop coordinator.
  Request-approval waits on the real gate; full-access may consume only
  selected-Change local gates after plan confirmation.
- Full-access may run local execution/recovery, safe `audit.accept`, local
  `result.apply`, local `landing.prepare`, and local `change.close`; it does
  not auto-run plan confirmation, raw scheduler, manual IntegrationCheck,
  integration apply/discard, merge, remote, PR, Harness evolution, scheduler
  loops, or parallel execution.
- Real in-app browser acceptance has verified request-approval stop behavior,
  full-access sequential local apply/landing/close, and full-access stopping
  before raw scheduler preparation.
- Real in-app browser acceptance has also verified low-conflict scheduler
  handoff: request-approval waits on the real gate, scoped full-access enters
  scheduler only through the controlled wrapper, and the flow stops at manual
  IntegrationCheck without exposing full-access on that terminal gate.
- Real in-app browser acceptance has composed the local scheduler terminal path
  through controlled scheduler workers, manual IntegrationCheck, human
  integration apply, and local landing readiness. Workbench now prioritizes
  local landing/terminal blockers over stale scheduler/audit context. The
  latest terminal blocker is local close readiness requiring review completion;
  no PR/remote/merge/Harness evolution ran.
- Scheduler acceptance has reached same-Change worker worktrees, validation,
  audit, ready integration candidate, manual IntegrationCheck, aggregate
  validation/audit, and human integration apply/discard.
- One loop execution maps to one parent Change. Multi-worktree outputs may feed
  IntegrationCheck only within that Change; cross-Change merge remains future
  explicit design.
- `desktop-cc-gui` is now a detailed product-layer reference for the next
  desktop shell / workspace / tools / provider-settings roadmap. All reference
  projects are local-only optional clones and are not repository dependencies;
  current implementation remains Codex-first Harness mode, while normal Agent
  mode, Claude Code / OpenCode providers, and Tauri packaging are future tracks.

Daily `npm run test:workbench` is the fast Workbench unit-capability gate; slow
scheduler/apply/Goal Loop coverage remains in explicit release/deep scripts.

Use `docs/STATUS.md` for short handoff context and
`harness/changes/INDEX.json` plus archived `summary.md` files for historical
detail. Do not rebuild current context by reading the full archive ledger unless
the task requires it.

## 2. Context Loading Order

1. Read this `AGENTS.md`.
2. Read `docs/ECL.md`.
3. If `harness/changes/active/` contains a change, read its `summary.md`, `spec.md`, `plan.md`, `tasks.md`, and relevant `reviews/`.
4. If no active change exists and `harness/evolution/pending.md` exists, read it before `docs/STATUS.md`.
5. Read `docs/STATUS.md`.
6. Read task-specific docs only as needed.

Archive history is loaded selectively through `docs/STATUS.md` paths or `harness/changes/INDEX.json`. Start with archived `summary.md` files; open specs, plans, reviews, or source only when the current task needs that evidence.

## 3. Project Sources

| Document | Purpose |
| --- | --- |
| `docs/PRODUCT.md` | Product requirements, MVP boundaries, and final product shape |
| `docs/AGENT-DEVELOPMENT-OS.md` | End-to-end product loop and staged roadmap |
| `docs/CURRENT-DEVELOPMENT-PLAN.md` | Current development plan and post-Phase-10Y roadmap context |
| `docs/ARCHITECTURE.md` | Architecture layers and major decisions |
| `docs/RUNTIME.md` | Runtime objects, facts, projections, and derived views |
| `docs/WORKBENCH.md` | Workbench information architecture and user interaction model |
| `docs/AGENT-MODEL.md` | Role, worker, review, rework, and document-agent model |
| `docs/BOUNDARIES.md` | Module and authority boundaries |
| `docs/ECL.md` | Change lifecycle, Harness rules, and evolution constraints |
| `docs/DEVELOPMENT.md` | Local commands and verification |
| `docs/references/index.md` | Reference source maps and when to use each reference |

## 4. Work Classification

Small changes are local, low-risk edits such as typos, comments, or narrowly scoped documentation wording with no interface, data, permission, architecture, runtime, or validation-chain impact.

Structured changes include cross-file behavior, APIs, schemas, architecture, validation chains, Harness rules/templates/scripts, reference source updates, unclear requirements, or work likely to exceed 20 minutes. Structured changes use active change files.

If an active change exists, first choose one path:

- `close`: the active change is implemented, verified, reviewed, and close-ready.
- `park`: the active change is incomplete or waiting for acceptance and the user is switching topics.
- `extend`: the new request is a same-scope defect fix or acceptance supplement.

For structured work, run or mentally apply:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight
```

Do not silently append unrelated phases to an old active change.

## 5. Structured Change Gate

Structured work needs:

- `spec.md` for WHAT and WHY.
- `plan.md` for HOW and planning-discovered gaps.
- `tasks.md` for executable steps mapped to acceptance criteria.
- `reviews/review.md` for independent review, coverage, and verification.

High-impact unknowns are recorded as `[NEEDS CLARIFICATION: ...]` and resolved before implementation.

## 5A. Minimal Implementation Gate

Before adding code or a Harness rule, check in order: can this be a no-op, can
an existing owner/helper solve it, can platform/stdlib/current dependencies
solve it, can the shared root cause be fixed instead of one caller, and only
then write the smallest coherent implementation. New evidence, projection,
summary, descriptor, or local framework layers are not justified unless they
replace an older layer or make a real product action reachable. This gate must
not weaken validation, source safety, stale revalidation, ToolPolicyGate, human
gates, security, or required tests.

## 6. Verification

Harness verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification:

```powershell
# Always start from the touched boundary: targeted Vitest suites, script contract
# checks, or drift greps that prove the changed behavior.
npm run typecheck
npm run lint
npm run test:fast
npm run build
# Escalate only when the changed boundary needs it:
npm run test:integration
npm run test:workbench
npm run test:workbench:slow
npm run test:workbench:release
npm run test
```

Use full `npm run test`, `npm run test:workbench:release`, or slow Workbench suites for broad runtime, full Workbench contracts, gate/source/apply, validation/audit, remote, scheduler, Goal Loop, package-script, or release-risk changes. For bounded docs, helper, or test-topology changes, record the targeted verification and why aggregate/full suites were not needed.

For documentation or Harness-rule changes, also run targeted drift checks for active paths, duplicate current-state fields, stale latest-phase language, and documentation entropy where applicable.

## 7. Task-To-Artifact Map

| Task Type | Start Here | Expected Artifact |
| --- | --- | --- |
| Product requirement | `docs/PRODUCT.md`, `docs/AGENT-DEVELOPMENT-OS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md` | Active change spec/plan/tasks |
| Architecture decision | `docs/ARCHITECTURE.md`, `docs/BOUNDARIES.md` | Plan decision and review evidence |
| Runtime object decision | `docs/RUNTIME.md` | Runtime boundary note |
| Workbench behavior | `docs/WORKBENCH.md` | Workbench spec or UI acceptance record |
| Agent/role model | `docs/AGENT-MODEL.md` | Role/spec proposal or architecture note |
| Harness rule change | `docs/ECL.md` | Structured change, review template/lint update if needed |
| Reference research | `docs/references/index.md` | Updated reference map or design doc |
| Current handoff | `docs/STATUS.md` | Resume, park, close, or next active change |

## 8. Product Boundaries

AHO workflow truth remains Change/ECL files, accepted Spec/Plan/Tasks/AC, TaskGraph, Run artifacts, Validation, Audit, Worktree state, Apply/Close decisions, and Harness evolution records.

Demand conversations are the primary user-facing work surface. Workpad, Topic, TaskQueue, SchedulerRun, Goal Loop packets/policies, SQLite, projections, and UI state are coordination or evidence layers unless a later accepted architecture decision promotes them.

Human confirmation remains required before high-impact canonical transitions such as source apply/merge, close/archive, remote landing, and Harness evolution apply. Agent audit, merge review, and Goal Loop recommendations are evidence, not final authority.

Current Goal Loop evidence is non-executing. Controller policy, next-step packets, prompt context, feedback evidence, gate-readiness preflight, and close-gate handoff metadata may explain, check, or recommend existing Harness gates, but they must not execute actions, mutate source, bypass ToolPolicyGate/human gates, or become workflow truth. A preflight id may attach to the matching concrete action as evidence only; close-gate handoff may attach to the existing `change.close` approval as derived context only. Accepted Spec/Plan/Tasks/AC artifact hash drift makes Goal Loop guidance stale until fresh evidence is recorded.

Scheduler and parallel-work artifacts remain bounded. First/next worker gates, validation/audit/rework, integration handoff/outcome, and SchedulerRun completion evidence do not authorize whole-wave dispatch, scheduler loops, slot allocators, child Changes, automatic apply/merge, or a full parallel executor unless a later phase explicitly implements those paths.

New product features must prefer reusing and strengthening existing core mechanisms. Feature modules should express domain differences; shared artifact, lineage, stale-revalidation, authority, ledger, projection, gate, and ToolPolicy logic belongs in common owners rather than feature-local mini-frameworks. Architecture quality is judged by ownership, reuse, verification, and lower future cost for similar features, not by file count, line count, or surface modularity alone.

## 9. Reference Source Rules

Reference source code may exist as local-only clones under `reference-projects/`, but those directories are developer workspace material and are not tracked project dependencies. Read `docs/references/index.md` and the relevant `docs/design-docs/ref-*.md` map before inspecting local reference source or fetching a reference from its GitHub URL.

Treat reference projects as evidence, not implementation instructions. Do not vendor-copy reference code into AHO product code. Do not stage reference source directories, gitlinks, or submodule metadata as part of this repository.

## 10. Documentation Entropy

`AGENTS.md` is a map, not the project history. It should stay compact and route agents to the current handoff, source docs, and archive index.

`docs/STATUS.md` is a short handoff, not the archive ledger. Historical facts stay in archived summaries and `harness/changes/INDEX.json`.

When updating handoff docs, add only current behavior and links that change agent decisions now. If old experience is superseded, merge it into a shorter rule, retire it from current docs, or leave it archive-only.

## 11. File Safety

- Preserve user changes. Do not revert unrelated edits.
- Use UTF-8 for source and documentation.
- PowerShell reads and writes must explicitly use UTF-8.
- Do not hand-edit `harness/changes/INDEX.json`; regenerate it with `scripts/harness-change.ps1 reindex`.
- Do not auto-apply Harness evolution from `pending.md`; use evidence, proposal, independent review, validation, and results logging.
