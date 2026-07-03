# Product Requirements

## 1. Product Positioning

Agent Harness Orchestrator is a local-first Agent Development OS with a Spec-Anchored Harness Kernel.

It manages requirements, project understanding, demand conversations, internal Changes/Workpads, specs, plans, TaskGraphs, coding runs, validation, review, and Harness evolution across local code projects. Its core purpose is to let a developer ask for work in natural language while keeping every meaningful state transition traceable to human intent, accepted artifacts, evidence, and gates.

AHO is not a generic multi-agent framework, ticket board, or chat UI. Multi-agent orchestration is a core execution layer, but the product kernel remains project-linked durable memory plus Spec-Anchored execution.

It borrows orchestration ideas from Agent Orchestrator, planning artifact flow from OpenSpec, Codex-oriented workflows from oh-my-codex, workspace/session/subagent boundaries from AgentScope, work-queue/runtime reconciliation ideas from Symphony, deterministic workflow-as-artifact lessons from Open Dynamic Workflows, Open Design's local Workbench interaction lessons, desktop Agent product-layer lessons from desktop-cc-gui, and ECL/Harness protocol rules from ecl-harness-engineer.

The long-term product loop is:

```text
Natural-language request
-> Demand conversation
-> Intake / Project Scan
-> Main planning-agent proposal
-> Proposal / Spec / Design / Tasks / AC artifacts
-> User confirm execution
-> Role pipeline / agent orchestration
-> Run artifacts / Validation / Audit
-> Result summary / Evidence
-> User confirm apply or merge
-> Archive / Evolution
```

The user should not need to know Spec, Plan, Tasks, AC, Run, Audit, Change, Workpad, Topic, or ECL before asking for work. AHO should infer the safest next workflow step and expose it through the demand conversation, evidence, and explicit decisions.

See `docs/AGENT-DEVELOPMENT-OS.md` for the end-to-end product loop and staged roadmap.

## 1A. Final Product Shape

The final AHO product is a project workspace with demand conversations.
Conversation records are chat windows and transcripts. When the user enters a
real workflow, explicit Harness Change/Workpad state carries the developer from
raw demand to verified, reviewed, human-applied code:

```text
Demand
-> Demand conversation
-> Intake / Clarification
-> Proposal / Spec / Design / Tasks / AC
-> User confirm execution
-> TaskGraph
-> TaskRun Queue
-> Task-scoped Worktrees
-> Per-task Validation / Audit
-> Integration Worktree
-> Aggregate Validation / Audit
-> Human Apply / Merge
-> IntegrationFix TaskRun when integration fails
-> Close / Archive / Evolution
```

AHO should feel more like an Agent Development OS than a ticket tracker. The demand conversation is the primary user surface; the internal Workpad is the operator read model; Thread is the narrative; Agent Loop is the evidence detail; Decision Inspector is the human gate.

AHO's product layer should eventually support two user-facing modes on one shared desktop/workspace shell. Harness mode is the professional development path and remains backed by Change/ECL, accepted artifacts, validation/audit, worktrees, apply/landing/close, and Harness evolution gates. A future normal Agent mode can provide a direct single-Agent conversation closer to desktop-cc-gui, but it must not weaken Harness mode or become the default authority for Harness work. Shared surfaces such as projects, chat, file references, file tree, Git, terminal, settings, Skills, runtime diagnostics, and provider configuration should be designed once and then bound to the selected execution algorithm.

Future dynamic orchestration must preserve that product shape. Phase 7H introduced only the proposal boundary: for complex demands, the main agent may propose a DecompositionPlan that explains whether the demand should remain one Change, become multiple TaskGraph execution units, become multiple child Changes, or stop for clarification. That plan is a proposal artifact shown through the demand conversation and evidence/details surfaces. Phase 7H confirmation records acceptance of the proposal only. Phase 7I adds a non-executing DecompositionReadinessManifest after confirmation so AHO can say whether a later execution layer may safely consume the proposal, which guardrail blocks it, and what next action is allowed. Phase 7J makes that verdict an execution gate: single-change readiness may authorize `code.run`, while sequential taskgraph readiness must first become a TaskQueueProposal. Phase 7L requires that proposal to compile into a versioned WorkflowGraphPlan before any confirmed queue start. Phase 7K adds a typed WorkflowRun journal for confirmed sequential TaskQueue execution so progress can be reconstructed and resumed only when the current Harness facts still match.

Resumability is part of the execution layer, not project truth. Phase 7K `WorkflowRun` may resume a paused sequential TaskQueue only when the Change, versioned WorkflowGraphPlan, proposal/readiness snapshots, accepted artifacts, source state, policy profile, runtime capability, and queue binding still match. Stale context, source drift, policy drift, missing evidence, mutable latest-file drift, or isolation failure must fail closed and ask the user. Reused progress remains evidence and still needs validation, audit, and human apply/merge/close gates.

Phase 7M protects the same product goal by repairing scoped action payloads and modularizing the typed workflow path. Phase 7N started a pure Workbench/runtime large-file split, and Phase 7O continues that refactor across server, projection, UI, and selected chat boundaries so future workflow and agent-orchestration changes are easier to implement without changing the product surface. The user still works from demand conversations; internal proposal, graph, queue, workflow, and module-boundary ids remain evidence/detail concepts unless a boundary document explains them.

Long-term merge/integration support is human-gated. AHO may prepare integration worktrees, merge attempts, aggregate validation, aggregate audit, and merge-review evidence, but it must not silently merge to the source tree.

After local landing readiness passes, AHO may create a Draft PR as a remote collaboration handoff when a real provider is configured and the user confirms. Draft PR creation is not merge authority. AHO may later read PR feedback/checks as remote evidence, route actionable feedback into same-demand rework, update the same Draft PR branch after another user confirmation, and submit a clean Draft PR for human review after a separate user confirmation. Phase 6T adds a user-confirmed remote landing boundary: a ready PR can be squash-merged through the provider only after the user chooses `合并 PR`. This still must not imply unattended landing, auto-merge enablement, reviewer assignment, branch cleanup, local source sync, or batch merge queue behavior.

Document and architecture maintenance are also product capabilities. AHO should not depend forever on an external skill to patch stale product docs or Harness handoffs. Documentation, Architecture, Evolution, Scorer, Reviewer, and memory-maintenance roles should detect drift, generate candidates, score them, and prepare review evidence. Accepted docs remain human-gated canonical project memory.

The long-term self-evolution loop is:

```text
archived/apply/failure/user-feedback/doc-drift event
-> maintenance ledger
-> background candidate extraction
-> scoring
-> review
-> maintenance report / proposal artifacts
-> human-gated apply only when explicitly chosen
```

The current fixed-window pending evolution mechanism remains a lightweight compatibility trigger. Phase 6S adds AHO-owned terminal closeouts, generated indexes/cache, five-change maintenance reviews, and doc budget guardrails. These run in the background and do not enter the current demand confirmation queue. They still do not silently edit canonical docs, ECL, product roadmap, source root, or curated stable memory.

Product-level maintenance must also prevent stable memory and long-lived docs from becoming append-only history. Raw closeouts, ledgers, run evidence, and archives remain durable, but current project memory should be compact, current, provenance-backed, and allowed to forget superseded inputs. Maintenance candidates should carry an explicit lifecycle resolution before any human-gated canonical update: promote a repeated lesson, merge duplicates into a shorter rule, retire stale current-state guidance, leave detailed history archive-only, or record noop when existing memory already covers the lesson.

The final user experience should feel like a goal-driven development
conversation. The user describes a goal, corrects the plan, and grants scoped
authorization; the main Agent then loops over current evidence and explains why
the next safe step is planning, sequential work, low-conflict parallel
worktree work, validation/audit, bounded rework, IntegrationFix, waiting, or a
user decision. TaskGraph, WorkflowRun, SchedulerRun, WorkerLease, recovery
keys, and worktree ids remain internal evidence/detail concepts unless the user
opens technical details. Low-risk authorized steps may eventually continue
inside the loop, but full-auto behavior is a later scoped-authorization
direction bound to the current demand, accepted plan, permission profile, and
source state. Apply, merge, close/archive, remote landing, destructive external
actions, product tradeoffs, and unclear requirements remain explicit human
decisions.

## 2. Problems

- Requirements often go straight into coding without `spec.md`, `plan.md`, or `tasks.md`.
- Project rules and decisions stay in chat instead of durable AHO-managed memory.
- New agents need repeated explanations of project constraints.
- Test failures and user corrections do not become rules, tests, or docs.
- Specs, tests, code, and validation results can drift without an explicit anchoring mechanism.
- Agent-internal memory and chat sessions are not reliable project memory.
- Multi-project state is invisible.
- Single skills cannot reliably manage multiple projects, worktrees, logs, and run state.
- Harness evolution currently depends on explicit ECL lifecycle and external skill support, but the product goal is AHO-owned background candidate generation plus human-controlled gates.
- Long-lived project memory and docs can grow into stale history unless AHO can detect documentation entropy, stable-memory budget pressure, and obsolete experience that should be merged, retired, or kept archive-only.

## 3. Target Users

Personal developers manage several local projects with Codex CLI or Claude Code and want AI to clarify requirements before coding.

Small teams want traceable, reviewable, verifiable AI coding workflows where project rules evolve from evidence.

## 4. Core Concepts

| Concept | Meaning |
| --- | --- |
| Project | An explicitly added local repository |
| Harness | Project-linked AI collaboration protocol, durable memory, and state |
| Demand Conversation | User-facing request thread under a project; internally bound to one Change/Workpad |
| Change | The core internal workflow unit, represented by ECL artifacts |
| Spec | The semantic anchor for a change or feature area |
| Acceptance Criteria | The validation anchor that should map to tests or checks |
| Evolution | Controlled improvement of project Harness from archived evidence |
| Run | A workflow execution attempt, eventually isolated in a worktree |
| Artifact | Durable evidence such as events, logs, diffs, validation reports, and reviews |
| Memory Mode | Where durable project memory lives: repo-local, external-local, or future remote |
| Workpad | Internal/projection control surface for one Change: goal, understanding, plan state, task graph, active agents, evidence, and next decision |
| TaskGraph | Accepted-task execution graph used by future multi-agent scheduling |
| WorkflowPlan / DecompositionPlan | Future main-agent-authored proposal for complex demand split, pipeline/barrier shape, role runs, synthesis, and recovery boundaries |
| Coding Work Package | Default coding assignment over one Change/TaskGraph scope for one coder-agent |
| TaskRun | One role-scoped execution attempt for a TaskGraph node |
| WorkerLease | Runtime claim that one worker/session owns a task attempt |
| AgentSession | Runtime session metadata for Codex app-server or other agent runtimes |
| AgentVisualState | Derived UI state for future agent activity map/animation |
| AgentTaskRepository | Future orchestrator-owned task surface for foreground role tasks and background maintenance tasks |
| Maintenance Ledger | Future append-only event stream for documentation, architecture, memory, and evolution candidates |
| Evolution Candidate | Future proposal generated from archived evidence, failures, user feedback, or document drift |

## 5. Product Principles

1. Local-first.
2. Explicit opt-in.
3. Change-driven.
4. Spec-Anchored development.
5. Shared artifacts over shared chat.
6. Project memory over agent-internal memory.
7. Worktree isolation.
8. Controlled evolution.
9. Human confirmation at high-impact gates.
10. Demand conversation over ticket board.
11. TaskGraph over unbounded agent group chat.
12. Evidence-first orchestration.

## 6. MVP Direction

Phase 0 creates this repository's Harness skeleton.

Phase 1 creates a TypeScript CLI for:

- Adding local projects.
- Listing managed projects.
- Auditing Harness state.
- Initializing or updating Harness files.
- Reading active change, pending evolution, git branch, dirty state, and recent runs.

Phase 2A adds Node-native structured change management:

- Creating active ECL changes.
- Reporting active change status.
- Parsing Acceptance Criteria IDs.
- Mapping tasks to Acceptance Criteria.
- Generating `ac-map.json`.
- Closing changes through a lightweight close gate.

Phase 2B adds local command run artifacts:

- Starting one local command run against an active change.
- Writing `run.json`, `context.md`, `events.jsonl`, `stdout.log`, and `stderr.log`.
- Listing and showing recorded runs.
- Preserving execution evidence without treating it as human approval.

Phase 2C adds Codex read-only proposal capture:

- Reusing the user's local Codex CLI configuration.
- Generating `context.md` and `prompt.md`.
- Capturing Codex stdout/stderr, JSONL events, and final proposal text.
- Treating Codex output as proposal-only evidence.

Phase 2D adds memory resolver foundation:

- Centralizing repo-local Harness/change/run roots behind a resolver.
- Writing `memoryMode: "repo-local"` into new project markers.
- Keeping old markers compatible as repo-local.
- Adding `aho memory status` as a diagnostic command.
- Keeping external-local and remote behind explicit resolver boundaries before enabling them.

Phase 2E adds external-local memory as an opt-in mode:

- `aho harness init --memory external-local`.
- Target repositories keep only `AGENTS.md`, `.agent-harness/project.json`, and `.agent-harness/.gitignore`.
- Durable docs, Harness files, scripts, changes, and run artifacts live under AHO home.
- `change`, `run start`, and `run codex` work against the external memory root.

Phase 3 adds managed execution gates:

- Phase 3A: AHO-owned worktree isolation.
- Phase 3B: change-scoped validation gate.
- Phase 3C: Auditor proposal gate.
- Phase 3D: Codex Coder write-mode runs inside AHO-owned worktrees.
- Phase 3E: explicit apply/discard gates for Coder worktrees.

Phase 4 adds Spec-Test anchoring:

- Phase 4A: explicit AC to test/validation evidence mapping.
- Phase 4B: Codex read-only proposals for reusing existing source-root test and validation evidence, accepted by explicit human command.
- Phase 4C: Codex-assisted passing test generation in AHO-owned worktrees, followed by validation, audit, human apply, and evidence proposal acceptance.
- Phase 4D: deterministic Spec-Test drift readiness, reporting missing/invalid/stale/failed/unknown/ok evidence states without CI enforcement.
- Phase 4E: Codex read-only Spec Agent and Planner proposals for the front half of the workflow, accepted by explicit human commands before coding.
- Later Phase 4 work: CI drift gates and stricter Spec-Test enforcement.

Later phases add:

- human-gated integration / merge / PR / push flows after apply/discard is stable.
- Switching external-local to the personal default after more migration and sync work.
- Run events, logs, diffs, validation reports, and review artifacts.
- Workbench Snapshot as the stable GUI read model, including Harness gap diagnostics for workspace/session/subagent readiness.
- Codex Skill Bridge as the boundary between AHO-managed skills and Codex runtime discovery. AHO owns skill source and enablement; Codex receives explicit materialized copies.
- Agent Runtime Bridge as the boundary between AHO-managed role routing and Codex execution. AHO chooses the role contract and records provenance; Codex receives ordinary `codex exec` prompts and discovers synced skills through its plugin mechanism.
- Run stream replay packets and structured approval actions for the first GUI.
- Personal GUI with Codex-style project folders, demand conversations, run replay visibility, and a scoped decision inspector.
- Demand conversation in the same workbench window, with read-only answers when appropriate, optional future Codex session continuity, and main planning-agent proposals that require user confirmation before execution.
- Interactive terminal sessions.
- Intake / Project Scan as the default demand-entry layer.
- One demand conversation -> one internal Change/Workpad as the default Workbench binding.
- TaskGraph materialization from accepted Plan/Tasks.
- Future WorkflowPlan / DecompositionPlan proposal artifacts for complex demand orchestration, confirmed by the user before Harness creates child Changes, TaskGraph execution units, or AgentTasks.
- Agent Orchestration Layer with queue, worker lease, retry, blocked, reconcile, and evidence handoff semantics.
- Codex app-server runtime bridge for richer Workbench sessions where appropriate.
- Agent activity map / animation as a derived visualization of TaskRuns and WorkerLeases.
- Integration worktrees, aggregate validation/audit, merge-review evidence, and integration-fix agent loops.
- Documentation and architecture drift agents that produce proposals and reviews instead of directly mutating canonical docs.
- Main Agent Task Repository for orchestrator-owned foreground role tasks and background maintenance tasks.
- AgentScope-style two-layer documentation/memory evolution: append-only maintenance ledger plus curated, scored, reviewed, human-gated canonical updates.

Long-term memory direction:

- `repo-local` remains the current implementation and compatibility/migration mode.
- `external-local` is the personal multi-project default target: business repos keep a marker and AGENTS memory map, while durable memory lives in AHO home.
- `remote` is the future team and cross-device mode: remote memory is authoritative and local memory is a cache.
- Cross-project knowledge memory is deferred and must use a separate namespace from single-project change history.

## 7. Non-Goals For MVP

- Cloud sync.
- Multi-user permissions.
- Remote memory gateway/server.
- Cross-project knowledge store.
- Automatic merge to main for the MVP.
- Unattended Harness mutation.
- In-product model API runtime.
- Automatic takeover of every project.
- GitHub issue integration.
- Linear dependency or external ticket tracker as required product layer.
- L3 Spec-as-Source as an immediate requirement.
- Default container sandboxing for the personal MVP.

## 8. Success Criteria

- A user can add a local project and initialize Harness.
- A structured change can move from spec to plan to Coder proposal to validation and audit evidence.
- Raw requests can be promoted to accepted `spec.md`, `plan.md`, and `tasks.md` through read-only proposal agents and explicit accept commands.
- Acceptance Criteria can become addressable anchors for tasks, tests, and validation in later phases.
- Codex CLI can be invoked through read-only proposal and worktree-bound Coder adapters.
- Pending evolution can be surfaced and handled with proposal, audit, validation, results, and mark-complete.
- Multiple projects can eventually be shown in a dashboard.
- A personal GUI can start without a selected project, keep project onboarding in the left sidebar, register or create local projects through native folder picking plus fallback path entry, initialize `external-local` Harness memory after explicit confirmation, and then present each demand as a conversation while preserving Change as the durable internal workflow unit.
- Developers can inspect replayed run artifacts and act on pending approvals from one project workbench; live agent streams remain a later transport phase.
- Developers can ask normal questions inside one demand conversation. Ordinary chat is read-only and records interaction history; converting a request into planning, coding, validation, audit, apply, or close still goes through controlled workflow actions.
- A user can stay inside the platform for the basic development cycle: demand intake, spec/plan/tasks proposal, code run, validation, audit, apply/discard, close/archive, and evidence review.
- Role contracts are explicit AHO assets, not hidden model memory. Future multi-agent scheduling will dispatch declared roles into TaskGraph-scoped runs rather than sharing a large chat context.
- Agent output is persisted as artifacts, not only chat.
- High-impact agent output is confirmed by a human before advancing critical state.
- Uninitialized projects are unaffected.
