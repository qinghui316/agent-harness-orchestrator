# Runtime Model

## 1. Purpose

This document defines the AHO objects that future GUI, Workbench Snapshot, and orchestration work must share. AHO uses durable project memory and explicit artifacts; visual views are projections over those facts.

## 2. Object Model

```text
Project
  -> Topic(Change)
    -> Spec / Plan / Tasks / AC / Spec-Test
    -> Runs
      -> Agent Stream / Events / Artifacts
      -> Worktree / Validation / Audit
    -> Approvals
    -> Archive / Evolution Evidence
```

## 3. Object Classification

| Object | Class | Notes |
| --- | --- | --- |
| Project | source of truth | Registry entry plus marker |
| Memory Store | source of truth | Repo-local, external-local, or future remote |
| Change | source of truth | Business work unit |
| Spec / Plan / Tasks / AC / Spec-Test | source of truth | Accepted ECL artifacts |
| Role Profile | source of truth | Bundled or future memory-scoped role definition |
| Agent Spec | source of truth | Future declarative role/subagent declaration |
| Run | source of truth | One execution attempt |
| Worktree | source of truth | Isolated code proposal state |
| Validation / Audit | source of truth | Artifact-backed evidence |
| Artifact | source of truth | Durable evidence file |
| Thread View | projection | User-facing narrative assembled from facts |
| Agent Stream | projection | Live or replayed view over run events |
| Approval | derived view | Actionable item inferred from canonical state |
| GUI Snapshot | derived view | Read model for the workbench |
| Session | runtime auxiliary | Optional future runtime continuity, never a replacement for Change |

## 4. Key Boundaries

### Change

A Change is the user-visible and auditable unit of work. It owns the accepted problem statement, plan, execution history, close gate, archive state, and evolution evidence.

### Run

A Run is one attempt against a Change. A Change may contain many Runs. A failed, cancelled, or interrupted Run does not rewrite the Change; it adds evidence to it.

### Session

If a future runtime adapter exposes sessions, they may help resume a process or thread. They remain runtime auxiliaries. They do not become the product kernel and must not replace Change as the durable work unit.

### Thread View

Thread View is a narrative projection over user messages, accepted artifacts, proposal artifacts, runs, and decisions. It is allowed to look conversational, but it cannot outrank the canonical files behind it.

### Approval

Approval is not a separate workflow store. It is derived from state such as:

- proposal exists and is acceptable;
- worktree has matching validation and audit evidence;
- Change is close-ready;
- evolution proposal awaits human approval.

Accepting an approval mutates the underlying canonical object, not the inbox item.

## 5. Workspace Relationship

AHO follows a workspace-like model without embedding a custom in-process agent runtime:

- `AGENTS.md` routes.
- Memory Store preserves durable project facts.
- Context Projection prepares executor input.
- Runs produce events and artifacts.
- GUI Snapshot derives operator views.

This borrows AgentScope Java's durable workspace discipline while preserving AHO's external-executor model.

## 6. Runtime Flow

```text
Change facts
-> Context Projection
-> Runtime Adapter
-> Run events / artifacts
-> Validation / Audit
-> Derived approvals
-> Human action
-> Canonical state transition
```

Streaming output belongs to the Run. Long-term project meaning belongs to the Change and Memory Store.

## 7. Snapshot Requirements

A future Workbench Snapshot should be able to derive, without adding a new authority:

- topic list and status;
- thread event feed;
- current agent runs and run summaries;
- per-project approval inbox;
- active worktrees;
- validation, audit, drift, and evolution summaries.

If a GUI field cannot be derived from existing facts, that is a signal to add or revise a canonical object deliberately, not to hide state inside the frontend.
