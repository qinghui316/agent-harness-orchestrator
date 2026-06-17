# Current Development Plan

This document preserves current roadmap and development-plan context outside the entry/handoff documents. `AGENTS.md` should stay a compact routing map, and `docs/STATUS.md` should stay a short resume point; this file carries the current plan-level summary that should not be lost during documentation compression.

## Product Shape

AHO is a local-first Agent Development OS. The user-facing model remains simple: a project contains demand conversations. The internal model binds each demand conversation to durable Change, Workpad, Topic, TaskGraph, role-run, validation, audit, apply, landing, remote handoff, and Harness evolution evidence.

The user should not need to know internal terms before asking for work. The main conversation should explain the current understanding, accepted state, agent progress, strongest evidence, and next safe decision. Internal objects support that conversation and must not leak as required user workflow unless the UI intentionally exposes them.

## Current Implemented Capability Tracks

- Conversation-first Workbench: project folders contain demand conversations, parent-agent transcript surfaces, inline run graph tabs, Workpad summaries, evidence/detail surfaces, and confirmation queues.
- Role execution: planning/coder turns may use Codex app-server when available; `codex exec` fallback remains valid and must be labeled honestly. Validator and auditor remain independent evidence runners.
- Result safety: result review, apply readiness, source refresh rework, integration checks, aggregate validation/audit, IntegrationFix, local landing readiness, Draft PR handoff, PR feedback, ready-for-review, remote landing, and post-merge reconcile are staged and human-gated.
- Scheduler path: scheduler artifacts now cover readiness contracts, launch preflight, SchedulerRun shell, runtime reconcile/claim reservation, first/next worker start, worker result/validation/audit, bounded rework, integration candidate/handoff/outcome, terminal completion, and blocked/exhausted closeout.
- Goal Loop path: GoalLoopDecision, iteration, continuation brief, next-step packet, packet freshness/parity, feedback, controller policy, controller refresh, main-Agent context, runtime prompt evidence, assisted concrete gate evidence, accepted artifact freshness, human close-gate handoff metadata, conflict reasons, Workpad read-only explanation cards, scoped start-next handoff evidence, scoped scheduler IntegrationCheck handoff evidence, scoped scheduler integration outcome handoff evidence, scoped SchedulerRun completion handoff evidence, scoped SchedulerRun blocked-closeout handoff evidence, scheduler execution-mode assessment, Workpad scheduler execution-mode surface, controller/preflight scheduler execution-mode handoff evidence, assisted concrete gate scheduler-mode consistency guard, enabled-gate projection guard, and enabled-gate server revalidation guard are implemented as non-executing evidence/context layers.
- Harness self-evolution: archive-triggered evolution can produce proposals, independent/subagent review evidence, results.tsv entries, and ECL/template deltas. Documentation entropy and experience lifecycle are now explicit review concerns.

## Current Hard Boundaries

- Change/ECL files, accepted Spec/Plan/Tasks/AC, run artifacts, Validation, Audit, Worktree state, Apply/Close decisions, and Harness evolution records remain workflow truth.
- Workpad, Topic, TaskQueue, SchedulerRun, Goal Loop packets/policies, SQLite, Workbench projections, and UI state are coordination or evidence layers unless a later accepted architecture decision promotes them.
- Goal Loop recommendations and controller policies are explanatory evidence only. They must not execute actions, mutate source, bypass ToolPolicyGate/human gates, or become workflow truth.
- Scheduler gates remain one-confirmation-per-legal-transition. They must not become a scheduler loop, whole-wave dispatch, slot allocator, automatic child Change creator, automatic apply/merge path, or full parallel executor until explicitly designed and implemented.
- Historical phase facts belong in archived summaries and `harness/changes/INDEX.json`, not in entry documents.

## Next Product Direction

The current product baseline is post-Phase-11S: Goal Loop evidence is non-executing, assisted concrete gate guidance and close-gate handoff metadata are freshness-bound to accepted artifacts, conflict-aware routing distinguishes low-conflict first/next worker-start gates from sequential/rework/integration/closeout handling, Workbench Goal Loop summaries expose conflict reasons plus typed routing posture as derived read-model evidence, Workpad details render that guidance as a read-only explanation card, main-Agent prompt/context artifacts can consume the fresh routing posture as read-only evidence, and Goal Loop artifacts carry a scheduler-owned execution-mode assessment that explicitly says current scheduler continuation remains single-gate staged or terminal/waiting evidence with scheduler loop/full executor authorization set to false. The Workpad Goal Loop card also surfaces that scheduler execution mode and its false loop/full-executor/whole-wave/slot authorization flags as read-only evidence. Controller policy and gate-readiness preflight handoff artifacts copy the same scheduler execution-mode false-authority evidence from the fresh packet, and preflight/main-Agent context reject or omit forged controller scheduler-mode evidence. The assisted concrete gate guard now requires scheduler execution-mode evidence to match across latest decision, iteration, continuation brief, packet, controller policy, and preflight before a concrete Workbench gate can carry the preflight id as evidence. Workbench projection, server-side current-action revalidation, and the assisted confirmation guard now also require Goal Loop feedback, controller refresh, gate-readiness, and assisted concrete affordances to attach only beside an enabled matching concrete gate, so disabled same-scope gates do not gain Goal Loop-derived enabled actions even if a client forges an assisted payload. The existing `planning.scheduler.worker.start-first`, `planning.scheduler.worker.start-next`, `planning.scheduler.worker.validate-first`, `planning.scheduler.worker.audit-first`, `planning.scheduler.worker.rework-validate-first`, `planning.scheduler.integration-check.run`, `planning.scheduler.integration-outcome.reconcile`, `planning.scheduler.run.complete`, and `planning.scheduler.run.close-blocked` gates remain covered end to end from packet scope through controller refresh, preflight, assisted concrete confirmation, enabled-gate projection, and enabled-gate revalidation where applicable. Generic blocked/no-action Goal Loop states remain suppressed and cannot compile preflight authority. The Phase 11L-11P Harness evolution window promoted active close-ready summary closeout lint; there is no pending Harness evolution.

- If continuing Goal Loop work, build on controller policy evidence without making it execution authority.
- If continuing scheduler work, either keep hardening single-gate staged capability or start a separate accepted design for a real scheduler loop/full parallel executor; do not imply loop/full parallelism from execution-mode evidence alone.
- If improving Workbench UX, keep implemented actions honest and bind every high-impact action to concrete target ids, stale revalidation, ToolPolicyGate, and human confirmation.
- If improving Harness self-evolution, use the Experience Lifecycle scan: promote, retain, merge, retire, and archive-only.

## Later Roadmap Options

These remain candidates, not current implemented behavior:

- A real parallel scheduler loop or full parallel executor.
- Automatic child Change creation from accepted decomposition.
- Container or remote worker sandboxing.
- True subagent chat rather than scoped worker/task delegation.
- Richer graph animation and editable workflow canvases.
- Provider-specific landing skills, reviewer assignment, or CI drift gates.
- Dynamic MCP tool paths and richer Codex app-server request-user-input synchronization.
- Long-term memory or cached replay that is explicitly bounded by repository truth.

## Preservation Notes

The pre-compression `AGENTS.md` and `docs/STATUS.md` carried a long phase ledger. That ledger has not been treated as disposable product planning content. Its durable historical source is the archived change summaries and `harness/changes/INDEX.json`; current planning context is summarized here and in the architecture/runtime/workbench/boundary docs.
