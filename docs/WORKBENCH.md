# Workbench

## 1. Purpose

The personal AHO GUI should feel like an agent workbench, not a traditional admin console. It should let one developer supervise several coding topics, inspect live agent work, and make the human decisions that advance a change safely.

The GUI is change-centered:

```text
Project
  -> Topic(Change)
    -> Thread View
      -> Runs
        -> Agent Stream / Events / Artifacts
    -> Approval Inbox
```

`Topic` is the user-facing word. `Change` is the domain object and durable source of truth.

## 2. Three-Pane Layout

```text
left navigation      center workbench                         right inbox
Projects             Topic header                             Project approvals
Topics               Thread View | Agent Loop View            Spec accept
Repo / Memory        messages, streams, artifacts             Plan accept
                     diffs, validation, audit                 Audit accept
                                                               Apply / close
                                                               Evolution
```

### Left Navigation

- Projects.
- Topics for the selected project.
- Repo and memory entry points.

One Topic maps to one Change. The first personal GUI does not support durable free-chat topics that exist outside a Change.

### Center Workbench

The center area has two complementary views over the same Change:

1. **Thread View**
   - User intent.
   - Spec proposal and accept events.
   - Plan proposal and accept events.
   - Coder outcomes.
   - Validation, audit, apply, close, and evolution events.
   - A human-readable narrative of how the Change progressed.
2. **Agent Loop View**
   - Run-level streaming output.
   - Tool and process events.
   - Per-run status.
   - Future interrupt, cancel, and replay controls.

Thread View is a user-facing projection. It does not replace the canonical Change, Run, or Artifact files.

### Right Approval Inbox

The right pane is scoped to the current project, not only the current Topic. It shows actionable items derived from canonical state:

- spec proposal ready for accept;
- plan proposal ready for accept;
- audit proposal ready for accept;
- validated and audited worktree ready to apply;
- close-ready Change;
- Harness evolution proposal awaiting approval.

`Approval` is a derived actionable view. Accepting one approval updates the underlying canonical object; the inbox itself is not a second workflow database.

## 3. Core UX Rules

- A developer should understand the current Change, next required decision, and strongest evidence without opening raw files first.
- Live agent work must be visible, especially when different roles run in sequence or later in parallel.
- A stopped or failed Run remains part of the Change history; interrupting a Run does not close a Change.
- Every high-impact action remains explicit even when represented as a button.
- Chat-like presentation must not hide Spec, Plan, Validation, Audit, or Worktree state.

## 4. Objects the GUI Should Surface

| Object | Why it appears |
| --- | --- |
| Project | Workspace boundary and project selector |
| Topic(Change) | User-visible work unit |
| Spec / Plan / Tasks / AC | Product intent and accepted structure |
| Run | Execution attempt |
| Agent Stream | Live run process |
| Worktree | Isolated diff proposal |
| Validation / Audit | Evidence gates |
| Approval | Human next action |
| Artifact | Inspectable evidence |
| Drift / Evolution | Long-term consistency and Harness maintenance |

## 5. Deferred GUI Scope

The first personal GUI does not need:

- durable free-chat topics outside Change;
- cross-project global approval inbox;
- remote collaboration;
- team permissions;
- multi-agent scheduling;
- full remote memory management.

The layout must still leave room for:

- multiple agent streams;
- run replay;
- interrupt and cancel;
- later multi-agent task visibility.

## 6. Next Implementation Implication

The next implementation step after this document should be a Workbench Snapshot: one read model that derives Topic state, thread events, approval inbox items, and run summaries from existing canonical artifacts without inventing a new source of truth.
