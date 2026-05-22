# Workbench

## 1. Purpose

The personal AHO GUI should feel like an agent workbench, not a traditional admin console. It should let one developer supervise several coding topics, inspect live agent work, and make the human decisions that advance a change safely.

The GUI is change-centered:

```text
Project
  -> Topic(Change)
    -> Topic Chat / Thread View
      -> Runs
        -> Agent Stream / Events / Artifacts
    -> Approval Inbox
```

`Topic` is the user-facing word. `Change` is the domain object and durable source of truth.

The information architecture in this document defines what the Workbench shows. The visual style is defined in `docs/UI-STYLE.md`. Static UI mockup prompts are maintained in `docs/design-prompts/workbench-ui-v1.md`.

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

One Topic maps to one Change. The first personal GUI does not support durable free-chat topics that exist outside a Change, but each Topic does own a continuous chat surface for asking questions, clarifying requirements, and triggering controlled workflow actions.

### Center Workbench

The center area has two complementary views over the same Change:

1. **Thread View**
   - Topic chat messages.
   - User intent.
   - Orchestrator plan cards.
   - Workflow summaries.
   - Validation, audit, artifact, apply, close, and decision evidence.
   - A human-readable narrative of how the Change progressed.
2. **Agent Loop View**
   - Run-level replay output.
   - Tool and process events.
   - Per-run status.
   - Future interrupt, cancel, and replay controls.

Thread View is a semantic Thread Stream projection over `thread.jsonl`, accepted ECL files, proposal artifacts, Runs, validation, audit, and decisions. Raw process/context/stdout events stay in Agent Loop / Run Replay. `thread.jsonl` preserves interaction history, but it does not replace `spec.md`, `plan.md`, `tasks.md`, `reviews/review.md`, or run artifacts as the source of truth.

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
- Until live transport exists, run stream replay packets provide the GUI with existing run events, logs, and artifact previews.
- A stopped or failed Run remains part of the Change history; interrupting a Run does not close a Change.
- Every high-impact action remains explicit even when represented as a button.
- Chat-like presentation must not hide Spec, Plan, Validation, Audit, or Worktree state.
- Ordinary Topic chat is read-only. It may answer questions and explain project state, but it must not write business code, mutate Harness files, or advance gates.
- Plan mode starts from the same Topic chat surface, but state changes still go through Spec/Plan proposal artifacts and explicit accept actions.
- The Workbench visual shell follows `docs/UI-STYLE.md`: neutral Open Design inspired panes, thin Topic header, ordinary-size Thread text, fixed composer, and inspector-style Decision Pane.
- Open Design is a visual and interaction reference only. AHO does not adopt Open Design's artifact iframe runtime, design editor, MCP/deploy/export surface, or artifact-first product model.

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
| Topic Chat | Interaction record and operator conversation, not canonical spec |

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

Phase 5A implements the Workbench Snapshot: one read model that derives Topic state, thread items, approval inbox items, run summaries, bundled role summaries, and Harness gap diagnostics from existing canonical artifacts without inventing a new source of truth.

Phase 5B adds replay-oriented run stream packets and structured approval actions. This prepares the first GUI shell without promising live WebSocket/SSE streaming, interrupt/cancel controls, or a materialized approval queue.

Phase 5C adds the first local browser GUI shell through `aho workbench serve`. Running it without a project opens the same three-pane Workbench shell with sidebar project onboarding: existing projects can be added through a native folder picker, new local projects can be created from a selected parent folder, and Harness memory initialization remains an explicit user confirmation. Running it with a project argument direct-opens that project. The UI is Chinese, three-pane, and replay-only: the center Agent Loop shows existing run artifacts as replay packets and labels them as replay. Future live transport, cancel, interrupt, background runs, and multi-agent scheduling remain separate implementation phases.

Phase 5D adds Topic chat and Codex plan-mode entrypoints. A user can keep asking questions in one Topic window; AHO records the conversation in `thread.jsonl`, optionally links to a Codex session for runtime continuity, and routes high-impact requests through allowlisted workflow actions. Ordinary chat stays read-only. Coder, validation, audit, apply, and close remain structured actions with artifacts and human gates.

Phase 5G changes the Workbench interaction shape from persistent workflow buttons to a Codex-App-style conversation workspace. The center surface is a single-column Topic conversation with semantic nodes and Orchestrator plan cards. The right pane remains a user decision panel: pending confirmations explain exactly what will be accepted, and accepted/requested-change/completed decisions stay visible as decision history. Orchestrator plan cards and decision display records are interaction projections; canonical workflow truth remains ECL files, proposals, run artifacts, validation, audit, worktree metadata, and apply/close state.

Phase 5H replaces the center timeline event list with `center.thread.items`, a semantic Thread Stream read model. Active, parking, and archived Topics can display persisted thread messages. Code workflow runs collapse into one workflow summary plus validation/audit evidence blocks, while raw run/process/context/stdout events remain available only through Agent Loop replay. Plan cards expose contextual Spec, Plan, and Tasks actions, but those buttons still call allowlisted workflow actions and do not make the plan card canonical workflow memory.

Phase 5I adds the first live transport and Codex-App-style interaction layout. The Workbench keeps replay endpoints for history and adds POST-based SSE endpoints for live Topic messages and allowlisted workflow actions. Live events are transport state only: thread logs, run artifacts, ECL files, validation, audit, apply, and close gates remain canonical. The center view uses a thin Topic header, normal-size Thread Stream text, an independently scrolling message surface, and a sticky bottom composer. Raw Codex/process output stays in Agent Loop / Run Replay; the main Thread shows user/assistant text, plan cards, workflow summaries, evidence, and decisions.

Phase 5L turns the Phase 5I/5J interaction model into a documented Open Design inspired visual system. It keeps the AHO three-pane workflow shell, but replaces the earlier warm retro styling with neutral product surfaces, compact navigation, ordinary-size chat typography, a single bottom composer shell, inspector-style decisions, and readable Agent Loop summaries. Phase 5L does not change Workbench APIs, SSE transport, or workflow authority.
