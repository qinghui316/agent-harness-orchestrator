# Reference: AgentScope Java

## Source

- Source repo: `https://github.com/agentscope-ai/agentscope-java`
- Local path: `reference-projects/agentscope-java/`
- Inspected commit: `9e83aa78efaf7ac9d3a58e4cde7be13665448c86`
- Reference status: local ignored source reference. Do not vendor-copy into AHO product code.

## Inspected Files

| File | Reason |
| --- | --- |
| `README.md` | Top-level agent framework scope and product positioning |
| `docs/zh/harness/overview.md` | Harness capability overview and user-facing model |
| `docs/zh/harness/architecture.md` | Runtime composition, hooks, and shared objects |
| `docs/zh/harness/workspace.md` | Workspace as durable source of truth |
| `docs/zh/harness/memory.md` | Two-layer memory and background consolidation |
| `docs/zh/harness/session.md` | Session persistence and state restoration |
| `docs/zh/harness/subagent.md` | Subagent specs, lifecycle, and task repository |
| `agentscope-harness/.../HarnessAgent.java` | Runtime wrapper over `ReActAgent` |
| `agentscope-harness/.../workspace/WorkspaceManager.java` | Two-layer workspace read/write model |
| `agentscope-harness/.../memory/MemoryConsolidator.java` | Curated `MEMORY.md` consolidation path |

## AgentScope Java v2 Harness Layer

The v2 Harness docs make the separation sharper than the older notes:

- `HarnessAgent` is a thin wrapper around `ReActAgent`, not a replacement reasoning loop.
- Harness capabilities layer onto the reasoning loop through middleware, hooks, toolkit entries, workspace files, and state stores.
- Built-in capabilities are assembled once at build time and stay orthogonal.
- The shared collaboration objects are `RuntimeContext`, the workspace / workspace manager, and the agent state store / filesystem backend.
- Workspace-driven persona, state persistence, memory, compaction, tool-result offload, subagent orchestration, sandbox isolation, plan mode, skill composition, MCP/tool allowlist, and channel routing are separate capabilities.

This v2 framing matters for AHO because it validates the post-Phase 8R module-boundary rule: new capabilities should enter through owned modules and explicit contracts, not by expanding a central reasoning loop or broad facade.

## Runtime vs Harness Split

AgentScope Java has two layers:

1. **Agent runtime / framework layer**
   - `agentscope-core` provides `ReActAgent`, model/tool/session abstractions, long-term memory, RAG, and subagent primitives.
   - The root README positions the project as a general Java framework for building production agents, not as a coding workbench.
2. **Harness layer**
   - `agentscope-harness` adds a `HarnessAgent` wrapper around `ReActAgent`.
   - `HarnessAgent` is not a new reasoning loop. It forwards `call/stream/observe/save/load` to the delegate and injects harness behavior through hooks, toolkit additions, skills, workspace, session, and filesystem abstractions.

This is materially different from AHO today: AHO treats Codex as an external executor and owns workflow state outside the model runtime; AgentScope Java owns both the agent runtime and the harness wrapper.

## What `HarnessAgent` Adds

`HarnessAgent` packages production defaults around a base agent:

- workspace context injection;
- skill loading from workspace;
- subagent orchestration;
- memory flush and background consolidation;
- session persistence;
- file-system abstraction;
- optional shell/sandbox execution;
- tracing and context-compaction hooks.

The code shows these capabilities are assembled in `HarnessAgent.Builder.build()` through the existing `ReActAgent` extension points rather than by replacing the core loop.

## Workspace as Source of Truth

The workspace model is central:

```text
workspace/
  AGENTS.md
  MEMORY.md
  knowledge/
  memory/
  skills/
  subagents/
  agents/<agentId>/sessions/
```

Key behaviors:

- `AGENTS.md`, `MEMORY.md`, and knowledge context are injected into system prompt before reasoning.
- `WorkspaceManager` is a stateless accessor.
- Reads use a two-layer model: abstract filesystem first, local workspace fallback.
- Writes go through the abstract filesystem so local, remote, and sandbox-backed storage can share one contract.
- The workspace also owns skill discovery, subagent specs, and session logs.

## Memory, Session, Filesystem, and Subagents

### Memory

- Layer 1: append-only daily ledgers under `memory/YYYY-MM-DD.md`.
- Layer 2: curated `MEMORY.md`, periodically rewritten by `MemoryConsolidator`.
- Background maintenance merges, prunes, and reindexes memory without blocking the main reasoning loop.
- `MemoryFlushManager` moves short-term/runtime memory into durable ledger-like files.
- `MemoryMaintenanceScheduler` schedules background maintenance instead of forcing the parent agent to do all cleanup inline.

### Session

- State snapshots and conversation logs are separate but aligned through `RuntimeContext.sessionId`.
- `WorkspaceSession` restores agent state across requests/processes.
- Session logs and session indexes are durable workspace artifacts rather than hidden model memory.

### Filesystem

- `AbstractFilesystem` separates logical workspace access from local, remote, composite, and sandbox-backed storage.
- Sandboxed execution is an optional backend choice, not welded into the core agent abstraction.

### Subagents

- Subagents can come from workspace Markdown specs, programmatic specs, or factories.
- Leaf subagents use independent prompts and memory and do not share parent conversation history.
- `TaskRepository` supports synchronous and background task execution, giving the parent agent a real delegation surface.
- v2 subagent and streaming docs add source-aware event forwarding: child and grandchild events can be tagged with runtime source metadata instead of being flattened into the parent stream.

### Plan Mode

AgentScope Harness v2 treats Plan Mode as a read-only, human-in-the-loop phase. AHO should borrow the terminal-state caution: "not in plan mode" is not enough to prove planning succeeded. AHO's equivalent remains stricter: proposal/plan/readiness artifacts must be accepted and scoped before code-producing execution can start.

### Channel / Service Boundary

AgentScope Harness v2 lists channel routing as a session-management and streaming boundary. AHO's Workbench server/SSE layer is not the same product, but future worker sessions should similarly separate:

- runtime session identity;
- event stream routing;
- user-visible transcript projection;
- durable evidence records.

None of these should replace Change/ECL or accepted artifacts.

For Phase 6Z, the important boundary is parent/leaf separation. In AgentScope Java, the parent agent has native tool/subagent abstractions; leaf subagents are independent execution contexts and do not become new orchestrators unless explicitly allowed. AHO maps this to `main-agent` owning `delegateTask`, while worker roles do not receive the delegation manifest and cannot spawn further role work. AHO still differs from AgentScope Java because Codex is an external runtime: the AHO task repository, policy gate, dispatcher, artifacts, and post-run audit live outside the model runtime.

## AHO Mapping For Background Maintenance

AgentScope Java is the strongest reference for AHO's future background documentation and memory self-evolution model:

| AgentScope Java concept | AHO future mapping | Boundary |
| --- | --- | --- |
| `TaskRepository` | `AgentTaskRepository` | Stores foreground and background agent tasks; not workflow truth. |
| synchronous subagent task | foreground planning/coder/validator/auditor/rework task | Still writes artifacts and evidence, not hidden chat-only state. |
| background task | documentation scan, architecture drift scan, evolution candidate extraction, candidate scoring | May run without blocking the main demand conversation. |
| `MemoryFlushManager` | append-only maintenance ledger writer | Can record evidence automatically, but not curated facts. |
| `MemoryConsolidator` | candidate extraction and curated memory proposal | Produces candidates and conflicts; does not directly overwrite stable memory. |
| `MemoryMaintenanceScheduler` | event-driven or idle background maintenance runner | Phase 6S uses a five-terminal-change window; richer idle/event scheduling remains later. |
| curated `MEMORY.md` | `project/stable`, product docs, ECL proposals | Human-gated promotion only. |
| memory pruning/reindexing | hot/warm/cold maintenance tiers plus generated cache | Used only by maintenance roles, not all role agents. |

This mapping matters because the current `ecl-harness-engineer` fixed-window evolution loop is a compatibility mechanism. AHO's final product should make documentation drift, architecture drift, and Harness evolution first-class background tasks, with scorer/reviewer roles and human gates.

Phase 6S implements the first AHO-owned consolidation pass from this mapping:

- every terminal demand can produce a compact closeout and append-only ledger entry;
- generated indexes/cache let maintenance agents read recent history without loading every archive;
- every five unreviewed terminal closeouts can trigger a maintenance review;
- scorer/reviewer roles evaluate reusable lessons, doc drift, and Harness evolution candidates;
- ordinary planning/coder/validator/auditor roles do not receive the full hot/warm/cold maintenance window.

This is intentionally weaker than AgentScope's full memory scheduler and consolidator. It does not silently rewrite canonical docs or curated project memory.

## AHO Mapping For Conversation-First Confirmations

AgentScope Java also clarifies the UI boundary for Phase 6L. Its `TaskRepository`,
task execution, subagent calls, and `TaskOutput`-style results are parent-agent
tools. They are not the default user conversation surface.

AHO should apply the same separation:

| AgentScope Java pattern | AHO Phase 6L mapping | Boundary |
| --- | --- | --- |
| Parent agent delegates to a task/subagent | Parent demand conversation invokes planning, coding, validation, audit, or integration-check tools | The user sees the parent agent explanation first. |
| Task output returns to the parent agent | Integration check returns a tool-result summary into the demand conversation | Raw paths and logs stay in evidence details. |
| Task repository stores execution state | Confirmation queue stores only human-gate decisions derived from AHO facts | It is a projection, not task/runtime truth. |
| Background tasks can run outside the main turn | Maintenance candidates can be grouped separately | Maintenance suggestions do not mix with code-apply confirmations. |

This supports the Phase 6L design: the right pane should not become a runtime
dashboard. It should show only decisions that need the human, while the center
conversation explains what the parent agent did and what the tool result means.

Phase 6N follows the same UI rule. A local `LandingReadinessPackage` and
`LandingReadinessReview` are task/tool outputs for the parent agent to explain.
The user should see a concise `提交/PR 前检查` summary and evidence links, not raw
package JSON, fake PR/push controls, or internal reviewer state. The
merge-reviewer output remains evidence for a future human/remote submission
step, not an automatic action.

Phase 6P uses the same parent-agent/tool-result boundary for remote PR feedback.
GitHub reviews, comments, and checks are read into PR feedback artifacts. The
parent agent explains the feedback and decides whether to create a foreground
same-demand rework task. The user should not see raw provider JSON or an
internal task repository; they should see the parent conversation summary and a
right-side confirmation only when updating the Draft PR branch requires human
confirmation.

Phase 6R keeps that AgentScope-style boundary for human review. Inline review
comments, review threads, top-level comments, and checks are tool results for
the parent agent, not separate user-visible subagent conversations. User input
in the main conversation becomes `ReviewFeedbackUserContext`; the parent agent
then either creates one same-demand rework task or prepares an explicit reply
draft. Reply submission and thread resolution remain human-gated tool actions,
not hidden background behavior.

Phase 6T keeps the same separation after review is complete. Remote landing
readiness, merge attempts, and merge results are tool outputs for the parent
agent. The user sees a concise readiness explanation and one `合并 PR` gate when
the provider state is safe; raw provider JSON, mergeable state details, and
maintenance ledger writes stay in evidence/details. A successful remote merge
may automatically write closeout and ledger artifacts, but curated docs, ECL,
product roadmap, and stable memory remain human-gated proposals.

Phase 6U applies the same boundary after the PR is merged. Post-merge reconcile,
local sync readiness, and remote branch cleanup readiness are tool results that
the parent agent summarizes. They are not exposed as raw git/provider state and
do not become ordinary role-agent context. Only concrete user-confirmed actions
enter the confirmation queue; sync is fast-forward-only and branch cleanup
deletes only the remote PR head branch.

Phase 6W applied this boundary to the Workbench run graph, and Phase 6X applies
it to the center transcript. The user should see the parent-agent conversation
first. TaskRepository entries, TaskOutput, run artifacts, validation/audit
evidence, PR handoffs, and maintenance tasks can be projected into a
demand-scoped run graph and compact parent-agent tool-result blocks, but they
remain tool results and evidence. AHO should use the graph and transcript to
explain delegation and status, not to turn subagents into fake chat sessions,
present derived summaries as exact LLM text, or replace Change/ECL truth.

Phase 6Y applies AgentScope Java's parent-agent/task-output idea without copying
its Java runtime. In AgentScope Java, tool calls and task outputs are native
runtime events. In AHO, Codex runtime events, AHO role delegation, validation,
audit, PR/landing, and maintenance evidence are separate facts that must be
projected into one readable parent-agent transcript with explicit source
metadata.

## Borrow Now

1. Keep memory, run/session state, and executor behavior as separate concepts.
2. Keep `AGENTS.md` as a thin entry map while durable memory lives in explicit structured stores.
3. Treat subagent definitions as declarative artifacts, not only hard-coded role strings.
4. Preserve a filesystem abstraction boundary so local, external-local, and future remote memory do not leak through every feature.
5. Design GUI/runtime views around stable objects: workspace, memory, sessions/runs, tasks/subagents, and artifacts.
6. Define future `WorkerSession`, `RuntimeWorkspace`, `AgentEventEnvelope`, and permission/external-execution boundaries before starting real parallel execution.

## Borrow Later

1. A richer subagent registry and task repository when AHO starts true multi-agent orchestration.
2. A pluggable remote/sandbox filesystem layer when remote memory or team execution becomes real.
3. More adaptive maintenance scheduling beyond the Phase 6S five-terminal-change window.

## Do Not Copy

1. Do not replace Codex with a custom in-process agent runtime just because AgentScope Java has one.
2. Do not import its full memory/session stack before AHO's coding workflow objects are stable.
3. Do not copy its Java-centric sandbox/session implementation details into the TypeScript CLI product.
4. Do not treat Plan Mode exit, subagent completion, or channel events as workflow truth.
5. Do not copy free-form recursive subagent delegation into AHO worker roles.

## Implications for AHO

- AHO's current direction is validated: durable project memory should be separate from disposable execution.
- `external-local` remains a sound personal-mode default; a future remote store can still preserve the same resolver boundary.
- Before GUI, AHO should continue stabilizing its own canonical objects rather than jumping straight to generic chat UX.
- When AHO adds multi-agent scheduling, it should model declared roles, tasks, and artifacts explicitly instead of sharing one large chat context.
- AgentScope Java is the strongest current reference for a future AHO `workspace/runtime` document, but not for replacing Codex execution.
- Workbench design should distinguish durable workspace facts from narrative thread views and runtime session views; AgentScope's workspace/session split is useful evidence, but AHO should keep Change above session.
- SchedulerContract should not be followed by a direct parallel executor until AHO has an explicit runtime-continuity contract for worker sessions, runtime workspaces, event sources, permissions, and recovery.

## AHO vs AgentScope Java

| Area | AHO | AgentScope Java |
| --- | --- | --- |
| Agent execution | External Codex-style executors | In-process Java agent framework |
| Product kernel | Change / Spec / validation / audit workflow | General agent runtime |
| Durable memory | Harness/docs/runs via resolver | Workspace + memory/session stack |
| Harness role | Workflow/state layer around external agents | Runtime wrapper around `ReActAgent` |
| Best reference value | Coding workflow orchestration | Workspace, memory, session, subagent architecture |

## Open Questions

- Which parts of AgentScope's workspace model should become explicit AHO concepts versus remain implementation details of `external-local` memory?
- Should future AHO subagent declarations live in project memory, bundled profiles, or both?
- When GUI starts, should AHO surface “run/session/task” separately or keep the current run-first model until multi-agent scheduling exists?
- How much background memory consolidation is useful for a coding workbench whose strongest artifacts are already structured changes, reviews, and validations?
