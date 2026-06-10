# Evolution Constraint Language

## 1. Purpose

ECL is this repository's change lifecycle. It makes requirements, plans, implementation tasks, validation, review, and Harness evolution visible as repository artifacts.

## 2. Context Loading

Agents load context in this order:

1. `AGENTS.md`
2. `docs/ECL.md`
3. Active change files under `harness/changes/active/`, if present
4. `harness/evolution/pending.md`, if no active change exists and pending evolution exists
5. `docs/STATUS.md`
6. Task-specific docs

## 3. Small Change

Small changes are local, low-risk edits with no interface, data, permission, architecture, runtime, or validation-chain impact.

Examples:

- Typos.
- Comments.
- Narrow documentation wording.
- Single-file low-risk fixes.

Small changes may skip active change creation under the current compatibility rule, but the final response or existing task notes must include verification. The target direction is stricter for source-modifying work: even small source edits should be attachable to a lightweight or Draft Change so diffs, validation, and closeout evidence have a durable `changeId`. That future direction does not make automatic Draft Change creation a current runtime capability.

## 4. Structured Change

Structured changes include:

- Cross-file behavior.
- APIs or schemas.
- Architecture.
- Harness rules or scripts.
- Reference source updates.
- Work likely to exceed 20 minutes.
- Unclear requirements.

Structured changes use active change directories in the current ECL lifecycle. Legacy CLI and hand-edited ECL flows remain single-active compatible: when no explicit `changeId` is supplied, commands may resolve the one active Change and reject zero or multiple active Changes. Workbench-managed demand conversations may have multiple active Changes; any write-capable run or high-impact action in that mode must carry an explicit `changeId`.

The Change is the binding and evidence boundary for the work, not a mandate that every task use the same fixed agent sequence. A structured code change may use the recommended planning/coder/validator/auditor template, but the main agent may also clarify, split work, request user input, retry repair, or run additional review when the evidence requires it. Apply, close, archive, merge, and Harness evolution remain high-impact transitions that require Harness gates and human confirmation.

Structured change files must not keep unresolved placeholder-only lines once work is ready for Harness validation. The ECL lint checks the current active change for lines that are exactly `TBD`, `- TBD`, or `- [ ] TBD`. Use explicit anchors such as `AC-001` in `spec.md` and `T-001` with `Covers: AC-001` in `tasks.md` so acceptance criteria and work items can be mapped mechanically.

## 5. Active Change Files

Each structured change contains:

| File | Purpose |
| --- | --- |
| `summary.md` | Short purpose, scope, and handoff |
| `spec.md` | WHAT and WHY |
| `plan.md` | HOW and planning-discovered gaps |
| `tasks.md` | Executable checklist |
| `reviews/review.md` | Independent review and findings |

High-impact unknowns are recorded as `[NEEDS CLARIFICATION: ...]` and block implementation.

## 6. Plan-First Inputs

When a user gives a plan, split it into:

- `spec.md` for goals, users, acceptance, non-goals, constraints, assumptions, and risks.
- `plan.md` for implementation strategy and validation.
- `tasks.md` only after the spec and plan are coherent enough to execute.

Do not repeat a full interview when the plan is complete and does not conflict with repository evidence.

## 7. Change Lifecycle

```text
new -> active -> park | close
parking -> resume -> active
active -> close -> archive
```

Only one active change is allowed.

Use `scripts/harness-change.ps1` for lifecycle operations. Do not hand-edit `harness/changes/INDEX.json`.

Before starting any structured work, run the active-change preflight mentally or with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight
```

If an active change exists, choose one explicit path before implementing:

- `close`: the active change is implemented, verified, reviewed, and `summary.md` is close-ready.
- `park`: the active change is incomplete or waiting for acceptance, and the user is switching topics.
- `extend`: the new request is a same-scope defect fix or acceptance supplement for the active change.

An extension must be recorded in the active change before implementation: explain why it belongs to the same change, add or update acceptance criteria/tasks, and name the required verification. Do not silently append a new phase to an old active change.

The lifecycle helper provides:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight
```

`status` reports active change readiness. `preflight` blocks stale, incomplete, or drifted active changes unless they are close-ready.

## 8. STATUS Handoff

`docs/STATUS.md` is the lightweight handoff after active work is closed. Before closing a change, update STATUS with completed work, verification, residual risks, and next recommended resume point.

After close, STATUS should point to the archived `summary.md`.

After an active change is closed, `docs/STATUS.md` must no longer point to the old active path. It must state that no pre-existing active change remains, name the latest archive path, and provide the next recommended structured work. If a new active change is opened immediately after close, STATUS must name that new active change instead of the archived one. STATUS is a handoff document, so semantic drift in phase names, active paths, or next-resume instructions is considered Harness drift even if `harness-change status` can still parse the filesystem state.

When a phase changes the current baseline or next recommended track, update the broader roadmap handoff docs in the same close/handoff pass, especially `AGENTS.md` and `docs/AGENT-DEVELOPMENT-OS.md`. `docs/STATUS.md` is the short-term truth, but stale baseline/next-step language in the roadmap docs causes later agents to plan from old product state.

Before closing a structured change that changes the active phase, product baseline, Harness rules, or next recommended track, record close/handoff drift evidence. The record should name the handoff files checked, the stale active-path or stale phase grep used, and whether the latest archive path, active change path, pending evolution state, and next recommended work agree across `AGENTS.md`, `docs/STATUS.md`, and any roadmap document touched by the phase. This is especially important after chains of runtime or Workbench changes where the next phase depends on exact active/archived wording.

`AGENTS.md` is also a handoff entry point. When an active change exists, both
`AGENTS.md` and `docs/STATUS.md` should name the same active change id and path.
When no active change exists, neither file should point at
`harness/changes/active/...`. The ECL lint enforces this narrow active-path
consistency check; it does not attempt to validate every roadmap sentence.

Before running `scripts/harness-change.ps1 close`, update the active change `summary.md` `## Current Status` section to a close-ready status such as `Completed.` or `Ready to close.`. Do not archive a change whose summary still says `Active`, `Ready for implementation`, `Pending`, or `In progress`.

If product code has been committed or accepted but the ECL active change remains open, the handoff must say that explicitly and name the next close action. Do not present the work as fully closed while `harness/changes/active/` still contains the change.

## 9. Real Acceptance Feedback

When a change includes manual or real-project acceptance, record not only whether it passed, but also how it passed.

Capture these signals in `summary.md` or `reviews/review.md`:

- manual config edits needed for acceptance;
- extra prompts or reviewer instructions needed to avoid incorrect agent blocking;
- retries caused by model, network, auth, or rate-limit failures;
- screenshots, DOM summaries, API snapshots, or run artifacts used as real acceptance evidence;
- environment-only failures that should not weaken product gates;
- agent-quality failures or product-fixable workarounds that should become follow-up changes or evolution evidence.
- external source/state safety when acceptance uses a demo repo, external project, reference repo, or temporary AHO home:
  - path or home used;
  - whether source mutation is in scope;
  - before/after source safety check, usually `git status --short`;
  - any state workaround, such as using an existing active Topic instead of mutating close/park state;
  - if real-project acceptance is deferred or split out, the follow-up acceptance path or limitation.

Do not make real Codex acceptance mandatory for every change. Use it when the change affects the coding, validation, audit, apply, runtime, or memory path. If real acceptance is unavailable for environment reasons, record that as an environment limitation and keep mechanical validation gates intact.

## 10. Worktree Diff Artifact Coverage

When a change affects worktree diff collection, diff-producing run artifacts, validation diff hashes, audit diff review, apply preview/apply gates, or Spec-Test generation, validation must include a case where a worktree creates a new previously untracked file.

Record whether this coverage is applicable in `reviews/review.md`. If applicable, record how it was tested. If not applicable, state why. This is not required for ordinary docs-only changes, small changes, or product changes that do not touch worktree-backed diff behavior.

## 11. Read Model Projection Coverage

When a change affects Workbench snapshots, GUI read models, approval inbox derivation, thread/run projections, role summaries, Harness gap reports, or other derived views, validation or review must include at least one projection-scope check.

The check should confirm that the derived view matches the documented scope. Examples:

- project-level approval inboxes should not be filtered to the selected Topic unless the spec explicitly says so;
- thread projections should remain derived from canonical run/change artifacts;
- role summaries and Harness gaps should not become new sources of truth.

Record whether projection coverage is applicable in `reviews/review.md`. If applicable, record what scope was checked and how. If not applicable, state why. This does not require a GUI, browser test, or new materialized index unless the change itself introduces one.

## 12. Runtime Bridge Boundary Coverage

When a change affects external executors, Codex bridge materialization, Codex plugin/skill/agent/command integration, Workbench SQLite stores, Topic chat/session persistence, prompt stack composition, AHO-managed skills, or other runtime bridge layers, validation or review must include a source-of-truth boundary check.

The check should confirm that:

- Harness files remain the workflow truth for accepted specs, plans, reviews, run artifacts, validation, audit, and close gates;
- SQLite tables are classified as interaction source, configuration source, derived index, or cache;
- Codex plugin/skill materialized files are runtime projections, not durable project memory;
- Codex session ids are runtime continuity only and do not override AHO context;
- structured runs rebuild their prompt stack from AHO memory instead of inheriting ordinary chat state.

Record whether runtime bridge coverage is applicable in `reviews/review.md`. If applicable, record the boundary checked and how. If not applicable, state why.

## 13. Workbench User-Surface Honesty Coverage

When a change affects Workbench user-facing decision surfaces, Workpad projections, composer actions, task/queue/audit controls, or post-run result actions, validation or review must include a user-surface honesty check.

The check must confirm that:

- visible primary UI only exposes actions backed by implemented workflow paths;
- the UI does not advertise out-of-scope future capabilities such as fake parallel workers, fake app-server sessions, fake agent conversations, fake merge queues, or unsupported retry/fix paths;
- primary user-facing surfaces do not leak raw internal runtime terms unless the spec explicitly allows them;
- repeated or duplicate primary actions are not shown when one action is the intended user affordance;
- high-impact actions still route through the documented workflow action or human gate.

Prefer a unit/web DOM assertion for forbidden visible terms/actions when the affected surface is rendered in tests. Real UI screenshots may supplement the check, but should not be the only guard when a deterministic DOM check is practical.

Record the sampled surface, forbidden terms/actions checked, implemented action paths verified, and result in `reviews/review.md` or `summary.md`.

### 13.1 Scoped Workbench Action Payload Coverage

When a structured change adds or changes Workbench live/server UI actions that depend on explicit target ids, validation or review must include scoped action payload coverage.

The check must confirm that:

- the rendered action carries every target id required by the server action contract;
- the live/server endpoint forwards those ids without falling back to global active state;
- the action fails closed or is hidden when required target ids are unavailable;
- primary actions and evidence/detail actions are not duplicated for the same user affordance;
- evidence/detail actions remain evidence-scoped and do not become extra confirmation-queue decisions.

Prefer deterministic unit, server, or web DOM tests for the payload and duplicate-action checks. Screenshots may supplement the record, but should not be the only guard when a test can inspect the rendered action or submitted payload.

Record the sampled surface, required target ids, action path tested, duplicate-action check, and result in `reviews/review.md` or `summary.md`.

### 13.2 Source Apply Safety Acceptance

When a structured change affects result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or any source-root apply handoff, validation must include explicit source safety acceptance evidence before close.

The acceptance record must show:

- the exact source project, isolated copy, fixture, or temporary AHO home used;
- whether the source root was read-only, checked in an isolated copy, or intentionally mutated only through explicit user confirmation;
- before/after source-root cleanliness or equivalent source-state evidence;
- that no source-root mutation occurs before the explicit human apply/merge confirmation;
- for multi-result flows, that compatibility or integration evidence is recorded before applying multiple ready results.

Automatic IntegrationFix, remote PR/push, merge queues, and aggregate validation/audit are product capabilities. This rule does not require or imply those capabilities.

### 13.3 Remote Handoff Acceptance

When a structured change affects remote handoff behavior such as Draft PR creation, Draft PR updates, PR feedback refresh, provider capability detection, or remote review/check evidence, validation must include explicit remote handoff acceptance evidence before close.

The acceptance record must show:

- the provider and repository used, for example GitHub CLI plus the owner/repo;
- whether the remote repository is public, private, or an isolated acceptance repository;
- the provider capability state, including missing remote, missing CLI, missing auth, no permission, or ready;
- the exact remote artifact or status used as evidence, such as PR URL, branch name, review/comment URL, check status, or provider snapshot artifact;
- whether the action is local-only, read-only remote refresh, remote branch update, or Draft PR creation/update;
- confirmation that no out-of-scope remote action occurred, such as merge, land, push main, auto-merge, ready-for-review transition, review-thread resolve, or comment reply;
- external source/state safety for the source repo and any isolated acceptance copy used.

If provider-ready acceptance is unavailable because credentials, `gh`, network, permissions, or remote fixtures are unavailable, record that environment limitation and verify the unavailable-provider path does not expose fake remote action buttons. Do not weaken product gates or mark fake remote success.

### 13.4 Transcript Renderer Source-Boundary Coverage

When a structured change affects the default Workbench main conversation transcript, validation or review must include transcript renderer source-boundary coverage.

The check must confirm that:

- the default `对话` tab consumes one canonical transcript projection, currently `ParentAgentTranscriptCell[]`, rather than mixing independent fallback builders or legacy timeline renderers;
- user-visible assistant markdown comes from Codex runtime/app-server output or `codex exec` replay-compatible output, not AHO-derived workflow summaries;
- command, tool, MCP, file-change, and error rows use compact user-facing summaries in the main transcript, while command text, stdout/stderr, tool args/results, diffs, raw logs, artifact paths, policy details, and boundary audit details are available only through details, graph nodes, evidence drawers, or raw-log routes;
- AHO planning, role pipeline, result review, validation/audit evidence, maintenance, policy pass, boundary pass, and `turn/completed` records do not synthesize main-conversation body text unless that text is literally present in Codex-visible runtime/replay output;
- worker or role-agent transcripts do not automatically merge into the main-agent transcript; they remain scoped to Agent run graph node details unless the main agent actually surfaced them;
- validation does not claim to display private chain-of-thought, only visible assistant output, visible reasoning summaries when available, process rows, and evidence/detail links.

Prefer deterministic unit or web tests that assert forbidden derived labels and raw output previews are absent from the default transcript while expandable details remain accessible. Real UI screenshots may supplement the check, but screenshots alone are not enough when a test can inspect the rendered transcript cells.

### 13.5 Proposal / Runtime Boundary Coverage

When a structured change introduces or changes planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or other artifacts that could be confused with executable runtime or workflow truth, validation or review must include proposal/runtime boundary coverage.

The check must confirm that:

- the artifact is explicitly classified as non-executable proposal, guardrail/readiness verdict, derived projection, canonical workflow truth, or executable runtime;
- workflow-related changes record a minimal boundary matrix covering artifact type, authority classification, required target ids, Workbench/server/CLI/runtime scope propagation, and stale/forged/cross-change fail-closed behavior;
- Workbench and docs do not describe future-only dynamic workflow, scheduler, recovery replay, child Change creation, TaskQueue/TaskRun/AgentTask startup, or runtime orchestration as implemented unless the change actually implements and tests that path;
- user confirmation of a proposal or readiness artifact does not silently start execution, create child Changes, create TaskQueues, create TaskRuns, create AgentTasks, create worktrees, reuse cached work, or mutate source unless those high-impact transitions are in scope and gated;
- stale, forged, draft, superseded, rejected, or cross-change proposal targets fail closed before any canonical transition;
- recovery key material, journals, manifests, and events remain evidence or guardrail inputs unless a later accepted change promotes a specific object to workflow truth.

Prefer deterministic unit, server, or web tests that prove the no-execution and stale-target paths. Documentation-only reference changes must still record the boundary classification and the explicit non-goals when they introduce future workflow vocabulary.

Record the artifact type, authority classification, boundary matrix, out-of-scope execution paths checked, stale/forged target behavior, and result in `reviews/review.md` or `summary.md`.

### 13.6 Module Boundary Coverage

When a structured change adds or changes Workbench action execution, Workbench projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state, validation or review must include module-boundary coverage.

#### Future Feature Module Boundary Rule

Future product features must extend owned modules first. Before implementation, the plan or review must name the owner module for each new responsibility. New main implementation logic must not default back into a broad compatibility facade when a suitable owned module exists.

Compatibility facades may remain and may receive only thin entrypoint responsibilities:

- public export or backwards-compatible import surface;
- thin composition or dependency-injection wiring;
- route/action dispatch glue;
- shell-level orchestration that delegates to owned modules.

Main implementation logic belongs in owned modules. Examples include action handlers, runtime runners, projection builders, artifact repositories, server endpoint implementations, frontend panels, domain services, guards, lifecycle helpers, status helpers, and rendering helpers.

If a future feature must temporarily place main logic in a facade, the plan and review must explain why no suitable owner exists, what risk that creates, which tests protect it, and the follow-up split candidate. If module-boundary coverage is not applicable, the review must state why.

The check must confirm that:

- each new responsibility has an explicit module owner, such as action registry, action handler, projection builder, runtime facade, artifact manager, server route, or frontend panel;
- large compatibility facades may remain, but newly added behavior should not continue to accumulate in broad files when a suitable module boundary exists;
- public API shapes, Workbench projection shapes, and user-visible behavior remain compatible unless the change explicitly accepts a breaking change;
- retained responsibilities are named, so later agents know what still belongs in a facade and what should move to a focused module;
- tests cover at least one behavior path through the new module boundary when product code is changed.

For large-file split or repeated modularization phases, the review must also include a module handoff map:

- owner modules and the responsibilities they now own;
- retained facade responsibilities and the public compatibility exports that must remain stable;
- forbidden write-back locations where future agents should not add new workflow branches by default;
- follow-up split candidates, if a moved implementation module is still intentionally broad;
- the deterministic boundary tests or lint checks that protect import direction, facade compatibility, and behavior preservation.

File size alone is not a failure condition. It is evidence that a reviewer should inspect ownership and extension paths. Documentation-only changes that merely record architecture vocabulary should state why module-boundary coverage is not applicable.

Record the module owners, moved responsibilities, retained facade responsibilities, module handoff map when applicable, compatibility result, and tests run in `reviews/review.md` or `summary.md`.

## 14. Controlled Evolution

Harness evolution starts from archived evidence:

- Repeated failures.
- User corrections.
- Validation gaps.
- Rules that can be mechanically checked.
- Agent misunderstandings.

When `harness/evolution/pending.md` exists, it is a maintenance reminder, not a hard lock. Acting on pending evolution requires proposal, independent review, validation, `results.tsv`, and `mark-complete`.

If no independent scorer is available, the only allowed result is `noop` with dry-run evaluation.

Independent review or scoring may be performed by a subagent only when the user has explicitly authorized subagent use and the environment supports it. Record the subagent scope, recommendation, score if any, and limitations in `reviews/review.md` or the evolution proposal. Subagents may review and score pending evolution evidence, but they do not replace the ECL lifecycle, do not own `mark-complete`, and do not imply product multi-agent scheduling.

Current implementation note:

- `harness/evolution/pending.md` and `harness/evolution/state.json` remain the compatibility mechanism for surfacing accumulated archive evidence.
- The current archive threshold, including `archive_threshold=5` where configured, is a lightweight trigger rather than the final product model.
- This document does not authorize scripts or agents to change `state.json`, run `mark-complete`, or apply evolution automatically.

Future AHO direction:

```text
archived/apply/failure/user-feedback/doc-drift event
-> maintenance ledger
-> background candidate extraction
-> scoring
-> review
-> user-visible maintenance suggestion
-> human-gated apply
```

Future background documentation, architecture, evolution, scorer, and reviewer agents may create evidence and recommendations. They must not directly modify canonical docs, ECL rules, product roadmap, Harness templates, project stable memory, or source root without the normal ECL proposal/review/validation/human gate.

## 15. Reference Project Updates

Reference projects are submodules under `reference-projects/`. Updating them is a structured change because it changes the source context available to future agents.

Each update must record:

- Repo and commit before/after.
- Reason.
- Product implications.
- Verification.
