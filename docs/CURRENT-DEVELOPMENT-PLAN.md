# Current Development Plan

This document is the sole owner of AHO's current product roadmap. Current task status, Lane claims,
Change evidence, validation results, and completion history belong to the project Harness Registry
and Change summaries, not this document.

## Product Direction

AHO is a local-first Agent Development OS. A user works through project-scoped conversations while
AHO preserves explicit, reviewable evidence for requirements, planning, execution, validation,
audit, apply, landing, and project-memory maintenance.

The default product path is:

```text
Demand conversation
-> persistent Main Agent provider thread and native Goal
-> real parent-spawned Planning child
-> immutable proposal and explicit user intent
-> accepted Change and WorkflowGraphPlan
-> Workflow Runtime gates and bounded role execution
-> validation, audit, result review, and authorized local apply
-> separately confirmed remote landing when requested
```

Native Goal provides provider-thread continuity and completion judgment. It is not project memory,
workflow truth, or execution authorization. The accepted Change and run artifacts own workflow
truth; Workbench conversations, graphs, Agent Office, queues, and other UI projections explain that
truth without replacing it.

## Current Baseline

The current implementation includes:

- provider-neutral runtime contracts with Codex as the first adapter;
- persistent Main and Child provider sessions with exact lifecycle identity;
- one canonical Timeline and one server-owned Agent Surface projection;
- a Workflow Runtime that owns executable transitions and revalidation;
- bounded worktree, validation, audit, integration, apply, and remote-landing evidence;
- a local Workbench with project conversations, Composer, files, Git, terminal, diagnostics, and
  Agent Office;
- project-memory Maintenance and five-qualified-Change Evolution through one serial AgentTask owner;
- project-bound local Harness Skills for development knowledge, Change evidence, coordination, and
  Evolution.

Historical phase labels, superseded compatibility paths, and per-Change implementation ledgers are
not current architecture. They remain discoverable only through the relevant repository history or
project Harness Change index.

## Priority Outcomes

Future product Changes should advance these outcomes in order of evidence and user value:

1. Keep the Main Agent, Planning child, accepted Change, and Workflow Runtime on one exact lineage,
   with stale or forged actions rejected before execution.
2. Make bounded delegation, rework, validation, audit, and Integration easier to understand from
   the primary conversation without exposing internal coordination vocabulary as user workflow.
3. Extend provider support only through Provider Registry capabilities and adapters; generic
   Conversation, Workflow, Timeline, Agent graph, and UI owners must remain provider-neutral.
4. Strengthen recovery, cancellation, performance, and observable failure handling for long-lived
   Workbench and provider sessions.
5. Keep local apply and remote landing separately authorized, with candidate-bound evidence and no
   automatic push, PR, merge, or destructive external action.
6. Improve the Workbench and Agent Office as projections over canonical state without introducing
   duplicate identity, scheduling, persistence, or coordinate owners.

Each priority becomes implementation work only through an accepted Change with observable
acceptance criteria. This list does not authorize speculative framework growth or automatic
roadmap execution.

## Architectural Constraints

- Change, run, validation, audit, worktree, apply, close, and landing artifacts own workflow truth.
- Workflow Runtime owns business-execution transition policy; leaf modules expose bounded actions.
- Provider adapters own native protocols and sessions; generic owners consume provider-neutral
  contracts.
- Workbench persistence has one database/transaction owner and persists canonical Timeline events
  before publication.
- Read models and UI state never drive canonical writes by inference.
- Local source mutation requires scoped current evidence and revalidation. Remote operations and
  destructive external actions require separate user confirmation.
- Reference projects are evidence only. They are not dependencies, authority, environment, CI, or
  roadmap owners.
- New features should strengthen an existing owner or replace an obsolete path rather than add a
  second policy, compatibility route, or wrapper-only layer.

## Planning Sources

Use these documents with this roadmap:

- `docs/PRODUCT.md` for product scope and user outcomes.
- `docs/ARCHITECTURE.md` and `docs/BOUNDARIES.md` for ownership and dependency direction.
- `docs/RUNTIME.md` for canonical facts, artifacts, and projections.
- `docs/WORKBENCH.md` and `docs/UI-STYLE.md` for user-facing interaction and presentation.
- `docs/AGENT-MODEL.md` for roles, delegation, review, and rework.
- `docs/AGENT-DEVELOPMENT-OS.md` for the stable end-to-end product loop.

Before selecting the next Change, inspect the current project Harness Registry, active Change, and
relevant canonical source. Do not infer current status from this roadmap.
