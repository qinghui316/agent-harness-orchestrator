# Runtime Model

## 1. Purpose

This document defines the AHO objects that future GUI, Workbench Snapshot, and orchestration work must share. AHO uses durable project memory and explicit artifacts; visual views are projections over those facts.

## 2. Object Model

```text
Project
  -> Topic(Change)
    -> Spec / Plan / Tasks / AC / Spec-Test
    -> Topic Chat / Interaction Log
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
| Topic Interaction Log | source of truth for interaction history | Workbench SQLite records user/assistant/workflow messages, but not accepted requirements |
| Skill Source | source of truth | Memory-root `skills/{skill-id}/SKILL.md` plus references/examples |
| Agent Catalog | source of truth | Memory-root `agent-catalog.json` plus `agents/{role-id}.md`, with bundled profiles as defaults |
| Command Catalog | source of truth | Future memory-root command declarations for workflow entrypoints |
| Agent Runtime Bridge | runtime layer | AHO resolves role contracts and invokes Codex with bounded ECL context |
| Codex Bridge | runtime projection | Rebuildable materialized copy under Codex plugin discovery path |
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

Phase 5D uses Codex session ids only as a runtime continuity optimization for ordinary Topic chat. If Codex cannot expose or resume a session, AHO rebuilds the prompt from Topic context and canonical memory. The session id is never a project fact.

### Topic Interaction Log

The Workbench SQLite store records the GUI conversation and workflow narration for one active Topic. It may contain user messages, assistant replies, workflow action events, proposal pointers, approval decisions, and run/artifact references. Legacy `thread.jsonl` files can be imported for compatibility.

The interaction log is useful for continuity and the Workbench Thread View, but it does not replace accepted ECL files. If chat says one thing and `spec.md` says another, `spec.md` wins until a human accepts a new proposal or edits the canonical file.

### Skill Source and Codex Bridge

AHO skills are project memory. Their source lives under the active memory store:

```text
skills/{skill-id}/SKILL.md
skills/{skill-id}/references/
skills/{skill-id}/examples/
```

The Codex bridge materializes enabled skills into an AHO-managed Codex plugin namespace. That bridge is a runtime projection. It can be deleted and rebuilt from AHO memory and SQLite skill enablement. Codex global or native skills may exist, but they are not AHO project truth.

### Agent Catalog and Runtime Bridge

AHO agents are declarative role contracts. AHO chooses the role, validates its write capability, wraps the role Markdown with ECL context, and starts a scoped Codex run. This follows the oh-my-codex pattern of `agent_role -> role Markdown -> codex exec`, but keeps AHO Change, approval, run, and artifact records as the durable truth.

The agent bridge records role id, role hash, catalog hash, available skill ids, and bridge status on each Codex-backed run. It does not claim a skill was actually used unless Codex output later provides observable evidence.

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

Streaming output belongs to the Run. Ordinary chat belongs to the Topic interaction log. Skill enablement belongs to the Workbench store. Long-term project meaning belongs to the Change and Memory Store.

## 7. Snapshot Requirements

A future Workbench Snapshot should be able to derive, without adding a new authority:

- topic list and status;
- thread event feed;
- current agent runs and run summaries;
- per-project approval inbox;
- active worktrees;
- validation, audit, drift, and evolution summaries.

If a GUI field cannot be derived from existing facts, that is a signal to add or revise a canonical object deliberately, not to hide state inside the frontend.
