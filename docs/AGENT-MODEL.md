# Agent Model

## 1. Purpose

AHO's final agent model is a constrained development workflow model, not a generic agent framework and not a group chat.

Agents are role contracts that operate on accepted Change, Coding Work Package, TaskGraph, scoped worktrees, durable artifacts, validation, audit, and human gates. They hand off through evidence, not through unbounded shared conversation.

## 2. Reference Grounding

### AgentScope 2.0

AgentScope 2.0 is the Python main project reference for runtime/service concepts, not for AHO workflow truth. Its useful lessons are:

- event and message streams should have explicit envelopes instead of being inferred from chat text;
- permission requests should be first-class runtime events, with human-in-the-loop outcomes recorded separately from model output;
- workspace and sandbox adapters are runtime execution boundaries, not canonical project state;
- multi-session services can keep worker conversations and resumable runtime handles separate from product records;
- agent teams are orchestration surfaces that still need an external truth model.

AHO should map these ideas into future `AgentEventEnvelope`, `EventSource`, `RuntimeWorkspace`, `AgentSession`, `WorkerSession`, and permission / external-execution protocols. AHO should not copy AgentScope's service runtime or let agent-team state replace Change/ECL, accepted artifacts, Run, Validation, Audit, Apply/Close gates, or Harness evolution.

### AgentScope Java

AgentScope's useful lesson is the subagent boundary:

- subagents are independent contexts;
- subagents do not share the parent conversation history;
- subagent specs can come from Markdown front matter;
- `description` routes when a subagent should be used;
- leaf/depth limits prevent recursive delegation;
- task repositories separate synchronous/background task state.
- background maintenance can flush append-only memory and later consolidate curated long-term memory without blocking the main user flow.

AHO should borrow that specification shape, TaskRepository concept, workspace context injection pattern, and two-layer maintenance pattern, not the Java runtime. AHO agents run through external Codex/app-server/local command adapters and exchange artifacts through AgentTask, TaskRun, Worktree, Validation, Audit, candidate, review, and approval records.

The v2 Harness-layer lesson is more specific: `HarnessAgent` is a thin wrapper around an existing reasoning loop; capability enters through middleware, hooks, toolkit, workspace, and state store rather than by making the wrapper the agent brain. The shared objects are `RuntimeContext`, workspace, state store, and filesystem. Workspace-driven persona, memory, compaction, tool-result offload, subagent/background task sessions, sandbox, plan mode, and channel routing are separate capabilities. AHO should mirror that separation in future runtime-continuity contracts, not collapse it into TaskQueue, WorkflowRun, or Workbench chat.

The useful A2A lesson is context isolation, not open-ended agent chat. In AgentScope Java, a subagent gets its own session and receives workspace context such as `AGENTS.md`, memory, and knowledge through hooks; the parent sends a task and receives a result. AHO should mirror that shape with scoped Context Projection: every role can receive `AGENTS.md` as the routing map plus current Change/evidence packets, but ordinary worker roles must not inherit the full parent transcript, full archive, maintenance ledger, or unrestricted tool/delegation manifest.

### Symphony

Symphony's useful lesson is the worker lifecycle:

- orchestrator owns poll, dispatch, reconcile, retry, and blocked state;
- worker/agent runner owns one workspace/session attempt;
- runtime state tracks running, claimed, blocked, retry attempts, and completed work;
- workflow contract lives in repo-owned files;
- dashboard is an operator projection, not workflow truth.

AHO maps Symphony concepts this way:

| Symphony | AHO |
| --- | --- |
| Linear issue | Change / TaskGraph |
| issue workspace | task worktree or integration worktree |
| workpad comment | Change Workpad |
| running / claimed / blocked / retry | TaskQueue / TaskRun / WorkerLease |
| rework state | task retry or IntegrationFix TaskRun |
| dashboard | Workpad / Agent Activity Map |

AHO does not copy Linear-first state, unattended-only operation, Elixir/OTP implementation, or PR/merge assumptions.

### oh-my-codex

oh-my-codex shows a practical role prompt shape:

- front matter such as `name`, `description`, `model`, and `disallowedTools`;
- hook-level guardrails such as PreToolUse delegation enforcement, PermissionRequest command mediation, PostToolUse verification, and post-execution permission scans;
- prompt body with Role, Why This Matters, Success Criteria, Constraints, Investigation Protocol, Tool Usage, Output Format, Failure Modes, and Final Checklist;
- clear non-responsibilities and handoff targets;
- review agents produce severity, verdict, and file/line evidence.

AHO should use this as a role-document and boundary style. AHO role docs must state responsibilities, non-responsibilities, allowed inputs/outputs, write capability, human gates, handoff artifacts, output contract, and failure modes. Phase 6Z borrows the guardrail shape without copying the plugin runtime: AHO-owned actions go through `ToolPolicyGate`, role sessions start with a `WorkerPermissionProfile`, and unobservable Codex internal writes are checked by post-run boundary audit.

### OpenAI Codex

Codex is an external executor and runtime boundary:

- `codex exec` provides JSONL and last-message artifacts;
- app-server is a future richer session/runtime bridge;
- non-interactive exec cannot promise dynamic approval;
- Codex output is proposal/evidence.

AHO owns workflow state, gates, artifacts, and project memory/evidence. Codex may own user-level preferences or cross-project memory outside AHO; AgentSession is runtime auxiliary, not product truth.

### OpenSpec

OpenSpec's useful lesson is the planning artifact flow:

- one change owns a proposal, specs, design, and tasks;
- exploration can happen before committing to a change;
- artifact dependencies guide what can be generated next without turning the workflow into rigid phase gates;
- implementation starts after the planning artifacts are coherent enough;
- verification compares implementation against the artifacts before archive.

AHO maps this to the main planning-agent stage. `spec-agent` and `planner-agent` are better treated as internal capabilities of one user-facing demand conversation, not as two mandatory conversations. The planning-agent may produce requirement, design, task, and AC artifacts, but those artifacts remain proposals until user confirmation promotes them into AHO's canonical Change state. In Phase 6E, `planning-agent` may run through Codex app-server so the user can steer or interrupt the active planning turn; when app-server is unavailable, the same role falls back to `codex exec` and feedback is applied on the next turn.

### Open Dynamic Workflows

Open Dynamic Workflows adds the missing reference for a deterministic workflow artifact. Its useful shape is: the main model authors bounded control flow, the runtime executes leaf `agent()` calls, `pipeline()` advances independent items without unnecessary barriers, `parallel()` is used only when a later stage needs all prior results, and a journal can resume completed leaf calls.

AHO should borrow this as future internal orchestration mechanics, not as a generic agent framework. Phase 7H treats DecompositionPlan as a main-agent proposal only: user confirmation records the accepted direction but does not yet compile it into child Changes, TaskGraph execution units, AgentTasks, worktrees, runs, validation, audit, or synthesis records. Phase 7I adds DecompositionReadinessManifest as a guardrail verdict for that confirmed proposal. Phase 7J makes the verdict a code-producing execution precondition: `ready-for-single-change` can authorize direct `code.run`, while sequential readiness must pass through TaskQueueProposal generation. Phase 7L compiles a confirmed sequential proposal into a versioned WorkflowGraphPlan before TaskQueue start; the graph is AHO-owned typed execution input, not a model-authored JavaScript script. Phase 7K adds WorkflowRun journal/recovery evidence for confirmed sequential queues. Worker roles remain leaves. They cannot call `delegateTask`, create child Changes, spawn workflow agents, apply, merge, close, archive, or rewrite canonical docs unless a later AgentSpec and ToolPolicyGate explicitly grant a bounded capability.

Recovery must be Harness-scoped. Reusing a completed leaf result requires matching Change, WorkflowGraphPlan id/hash, TaskGraph node ids, role spec, RoleContextPacket / EvidenceContextPacket hash, accepted planning artifacts, versioned proposal/readiness refs, source revision, worktree base, and policy profile. A recovered result is still evidence, not trust; validation, audit, synthesis, and human gates remain required.

Phase 8S adds a SchedulerContract foundation for parallel candidates. The contract may describe independent leaves and dependency waves, but worker roles remain leaves and the contract itself cannot spawn agents. A later scheduler must still enforce policy, worktree isolation, validation, audit, integration, and human confirmation.

Phase 8T clarifies the missing runtime-continuity step between SchedulerContract and a real parallel scheduler. Before parallel execution, AHO needs worker session identity, runtime workspace/sandbox binding, event source replay, permission/external execution, and recovery contracts. These may be inspired by AgentScope 2.0 and AgentScope Java Harness, but they remain AHO-owned runtime auxiliaries and cannot replace workflow truth.

Phase 8U implements the first code-run slice of that runtime-continuity step, and Phase 8V extends the same sidecar evidence to validation and audit role workers. Coder, validator, and auditor execution can record `WorkerSession`, `RuntimeWorkspace`, `EventSource`, and `AgentEventEnvelope` evidence beside existing Run artifacts. This gives later worker-session, sandbox, event replay, and parallel scheduler work a scoped contract without changing role authority: workers remain leaves, validation/audit remain independent evidence gates, and high-impact transitions still require Harness and human gates.

Phase 8W adds the permission / external-execution evidence slice to that same contract. Worker runs may record `permission.profile.attached`, `permission.decision.recorded`, and `external-execution.*` envelopes, but those records are observational evidence. ToolPolicyGate remains the policy authority, human gates remain required for high-impact transitions, and no worker gains new delegation, apply, merge, close, scheduler, child-Change, or sandbox power from these events.

Phase 8Y adds a dry-run scheduler evidence slice before any real parallel executor. It can explain which SchedulerContract waves look dispatchable, which nodes would be blocked, and which runtime-continuity prerequisites a future worker launch would need. It cannot spawn workers, allocate leases, reserve slots, create child Changes, or let agent roles bypass validation, audit, integration, or human gates.

Phase 7M is a boundary/module repair phase for this model. It does not let workers spawn agents or author executable workflow scripts; it makes the main-agent-facing action registry, scope checks, projections, and TaskQueue/WorkflowRun runtime facade explicit so later subagent or scheduler features can be added behind Harness-owned typed artifacts.

Phase 7N continues that direction as a pure large-file boundary split. It moves Workbench shared types/thread-log helpers, action execution, runtime facade calls, projection builders, and frontend panels behind module owners. It does not grant workers delegation power, add a scheduler, or change the Harness-owned typed artifact chain.

### Open Design

Open Design shows how to present local daemon output:

- readable activity rows and tool cards;
- artifact-first evidence surfaces;
- local server as privileged daemon boundary;
- raw logs hidden behind evidence/replay views.

AHO maps this to Workbench: the main demand conversation shows user-readable role results, while Agent Activity Map and assistant activity are projections over TaskRun, WorkerLease, AgentSession, run events, and artifacts. They do not become workflow truth.

## 3. Future AgentSpec Shape

AHO should eventually support durable agent specs with a Markdown/front-matter style inspired by AgentScope and oh-my-codex.

Phase 6Y turns that direction into a controlled delegation contract. The main-agent/orchestrator may see a `delegateTask` role manifest and request `planning-agent`, `coder-agent`, `validator`, `auditor-agent`, or `rework-coder`. AHO policy must validate the request before any role runs. Worker roles do not receive the manifest; their preamble states they are not orchestrators, cannot call `delegateTask`, and cannot spawn subagents.

The target direction is freer main-agent orchestration with the same worker boundary. The main agent may ask follow-up questions, split one user request into multiple future Changes, select an existing Change, delegate roles in a non-fixed order, retry repair after validation/audit/feedback evidence, or stop for user input. Worker agents remain leaf roles unless a future AgentSpec explicitly grants bounded delegation and policy support. This keeps A2A as evidence handoff through Harness records, not as a shared group chat.

Phase 6Z makes that contract the foreground role execution path. A role run must be traceable as `MainAgentDecision -> DelegateTaskRequest -> ToolPolicyDecision -> AgentTask -> RoleDispatcher -> AgentTaskResult -> next MainAgentDecision`. The default order can still recommend coder, validator, and auditor, but the implementation must not bypass AgentTaskRequest, ToolPolicyGate, RoleDispatcher, or AgentTaskResult. Only a real runtime MCP call may set `delegationMode = runtime-tool`; backend policy dispatch uses `delegationMode = orchestrator-policy` and must be labeled honestly.

Phase 7E adds the role context packet boundary to that path. Core worker runs receive a `RoleContextPacket` rendered to `context.md` and preserved as `context-packet.json`. A2A remains artifact-mediated: the main agent sends a scoped task, Harness selects Change/evidence context, the worker runs as an isolated leaf role, and the result returns through AgentTaskResult, run artifacts, validation, audit, and boundary evidence. Workers still do not receive the parent transcript, full archive, maintenance ledger, raw logs, or delegate manifest by default.

Phase 7F moves the default foreground role-order policy into `MainAgentOrchestrationDecisionEngine`. Workbench still executes the existing code-change template, but next-step selection is now derived from recorded role evidence and failure classification. Validation or audit failure can trigger one bounded `rework-coder` attempt; boundary or code failure stops the pipeline; exhausted rework budget returns to user input. This is a first step toward freer main-agent orchestration, not worker-to-worker delegation.

Future WorkflowPlan / DecompositionPlan support should sit above Phase 7F. The main agent may propose whether a demand remains one Coding Work Package, splits into TaskGraph execution units, splits into multiple child Changes, or needs clarification. User confirmation is required before Harness materializes those targets. Leaf agents still receive scoped context packets and return artifact-backed results.

Boundary enforcement has three explicit modes:

- `broker-enforced`: AHO-owned actions such as delegateTask, apply, PR, review handoff, merge, sync, cleanup, close/archive, and evolution are checked before execution.
- `hook-observed`: Codex/app-server/MCP tool events that AHO can observe are recorded and may be partially mediated.
- `sandbox-audited`: Codex internal shell/write activity that AHO cannot observe per-call is constrained by runtime cwd/worktree/sandbox setup and checked after the run through source/worktree/evidence snapshots.

AHO must not claim that it can intercept every Codex internal shell/write call unless the runtime exposes that hook. A boundary violation makes the role result failed evidence and prevents apply-ready projection; AHO does not silently roll back user source files.

Candidate fields:

| Field | Meaning |
| --- | --- |
| `roleId` | Stable role identifier |
| `displayName` | User-facing label |
| `description` | Routing-quality description of when to use this role |
| `whenToUse` | Positive delegation criteria |
| `whenNotToUse` | Negative routing criteria, required for high-impact roles |
| `source` | Bundled, project memory, or user-defined |
| `preferredRuntime` | Codex exec, Codex app-server, local command, deterministic writer, or future runtime |
| `writeCapability` | Read-only, worktree-write, deterministic-writer, or proposal-only |
| `delegatable` | Whether an orchestrator may assign coding packages or TaskGraph-scoped future work to this role |
| `maxDepth` | Recursion/delegation depth limit |
| `allowedInputs` | Facts/artifacts the role may read |
| `allowedOutputs` | Artifacts or proposals the role may produce |
| `requiredArtifacts` | Evidence required before role may start |
| `handoffArtifacts` | Evidence produced for the next role |
| `humanConfirmation` | Gates required before output advances canonical state |
| `blockedReasons` | Structured blockers this role may report |
| `tools` | Tool classes the role may use |
| `modelPolicy` | Preferred model/effort/cost tier policy |
| `promptBody` | Role instructions |
| `outputContract` | Required result format |
| `failureModes` | Known failure cases and how to report them |

Rules:

- `description` must be routing-quality, not marketing copy.
- `whenNotToUse` is required for source-writing, merge, documentation, and architecture roles.
- `writeCapability` must distinguish read-only, worktree-write, deterministic-writer, and proposal-only.
- Roles that can affect source or canonical docs require human confirmation rules.
- Recursive delegation is disabled unless explicitly allowed.
- Agent output is proposal/evidence until accepted.

## 4. Core Development Roles

| Role | Purpose | Outputs | Human gate |
| --- | --- | --- | --- |
| `orchestrator-agent` | Decide the next safe role task from demand conversation state, accepted artifacts, evidence, feedback, and gates | `OrchestratorDecision`, `AgentTask` records, user-readable summaries | Required before high-impact canonical transitions |
| `intake-agent` | Read-only project and demand understanding before Spec | intake summary, clarification requests, related files/evidence | Required before canonical Spec changes |
| `planning-agent` | Draft and revise proposal, requirements, design, tasks, and AC in the main demand conversation | proposal/spec/design/tasks/AC artifacts and conversation summary | Required before canonical implementation artifacts and execution |
| `spec-agent` | Internal capability for behavior requirements and acceptance criteria inside planning | spec proposal sections | Not a separate user-facing conversation by default |
| `planner-agent` | Internal capability for implementation plan, tasks, and AC map inside planning | plan/task/AC proposal sections | Not a separate user-facing conversation by default |
| `coder-agent` | Implement one Coding Work Package in an isolated worktree, using TaskGraph tasks as checklist/evidence | worktree diff, implementation artifact, run artifacts | Cannot apply to source directly |
| `validator` | Mechanical validation | validation artifacts | Evidence only |
| `auditor-agent` | Semantic review of task worktree evidence | audit artifacts/findings | Not merge authority |

## 5. Integration And Rework Roles

| Role | Purpose | Outputs | Boundary |
| --- | --- | --- | --- |
| `integration-agent` | Combine multiple task worktrees into an integration worktree | integration worktree, merge attempt artifact | Cannot write source tree directly |
| `integration-fix-agent` | Repair combined-result conflicts or failed aggregate evidence in an integration worktree | repaired integration artifact, fix notes, aggregate evidence | Cannot replace single-demand rework or apply source root |
| `aggregate-validator` | Validate integrated result mechanically | aggregate validation evidence | Evidence only |
| `aggregate-auditor` | Review integrated result semantically | aggregate audit evidence | Not final merge authority |
| `integration-fix-agent` | Fix merge conflicts, aggregate validation failures, or aggregate audit blockers | repaired integration proposal and evidence | Requires re-validation and re-audit |
| `merge-reviewer-agent` | Read-only local landing readiness review after a result has been applied to the source root | `LandingReadinessReview`, verdict, risks, missing checks, evidence refs | Cannot commit, push, create PRs, merge, apply source, or edit canonical docs |

Integration roles exist because per-task success does not prove combined success. The source tree should change only after integration evidence and human confirmation.

The `merge-reviewer-agent` is intentionally later than apply and earlier than PR/merge adapters. It reviews the local `LandingReadinessPackage` as evidence for a submission step. Its verdict is not human approval and not merge authority. Phase 6O's PR Draft Adapter consumes this evidence to prepare or create a Draft PR. Phase 6P lets the parent/orchestrator agent read remote PR feedback as tool evidence and create same-demand `rework-coder` AgentTasks for actionable feedback. Phase 6Q lets the parent/orchestrator agent prepare a ready-for-review handoff when feedback/checks are clear, but the actual `提交人工评审` action remains user-confirmed. Phase 6R keeps the same parent-agent boundary for human review feedback: reviews, comments, inline comments, checks, and user stance become one same-demand rework/reply context. Phase 6T lets the parent/orchestrator agent prepare remote landing readiness and expose `合并 PR` only as a user-confirmed provider action. `rework-coder` handles actionable code feedback; reply/resolve handoffs require explicit user confirmation and provider capability. No role agent gains unattended merge/land authority, reviewer assignment authority, auto-merge authority, push-main authority, branch cleanup authority, local-sync authority, or unconditional permission to resolve review threads.

## 6. Documentation And Evolution Roles

| Role | Purpose | Outputs | Boundary |
| --- | --- | --- | --- |
| `documentation-agent` | Detect stale docs, broken reading paths, stale AGENTS/STATUS/product docs, and stale reference maps | documentation proposal, `DocDriftFinding`, `DocumentationReview` | Cannot directly edit canonical docs without accepted action |
| `architecture-agent` | Check consistency across product, architecture, runtime, Workbench, and agent model docs | architecture findings/proposals | Proposal-only |
| `evolution-agent` | Turn archived evidence into Harness/process evolution proposals | evolution proposal/review/result | Must follow ECL evolution gates |
| `evolution-scorer` | Score documentation, architecture, memory, or Harness evolution candidates | `CandidateScore` with rationale, risks, and confidence | Scoring only; cannot promote |
| `evolution-reviewer` | Independently recommend accept, defer, or reject for a scored candidate | `CandidateReview` and evidence summary | Review only; cannot apply or mark complete |

These roles address the current limitation of relying on an external skill to patch documentation drift. In the final AHO product, documentation and architecture maintenance should be first-class, evidence-backed agent workflows with human gates.

They must follow an AgentScope-style two-layer model:

```text
append-only maintenance ledger
-> background candidate extraction
-> candidate scoring
-> independent review
-> human-gated canonical update
```

Phase 6S makes this more concrete. Terminal demand closeouts and maintenance ledger entries can be written automatically. Every five unreviewed terminal closeouts may trigger a maintenance review over a hot window, warm index, and cold archive refs. The scorer and reviewer reuse the existing `EvolutionCandidate` / `CandidateScore` / `CandidateReview` model with subtypes instead of creating a separate memory-candidate system.

The fixed archive-threshold `pending.md` mechanism remains a lightweight ECL compatibility mechanism. It is not the final product model for documentation or memory self-evolution.

## 6A. AgentTaskRepository Contract

AHO's parent-orchestrator model uses AgentTaskRepository as the delegation surface. Phase 6G introduces the file-backed v1 so foreground role work and background maintenance suggestions share the same evidence pattern instead of living only in chat or separate scripts.

Foreground tasks:

- planning;
- coder;
- validator;
- auditor;
- rework;
- result review/apply handoff.

Background maintenance tasks:

- documentation scan;
- architecture drift scan;
- memory/evidence consolidation candidate extraction;
- evolution candidate extraction;
- candidate scoring;
- candidate review.

Each AgentTask should point to input artifacts and output artifacts. AgentTask results must not live only in chat. AgentTaskRepository is runtime coordination and evidence routing; it does not replace Change/ECL truth, accepted artifacts, run artifacts, validation/audit, apply/close decisions, or human gates.

Phase 8A changes only module ownership for this repository and maintenance layer. AgentTask repository, decisions, maintenance ledger, closeouts, review windows, doc budgets, evolution candidates, schemas, paths/utils, and role-scoped context projection belong in owned `src/agent-task/*` modules behind the existing `manager.ts` facade. This does not change role permissions, delegation authority, maintenance authority, artifact shapes, or the requirement that canonical docs, ECL, stable memory, and source root remain human-gated.

Phase 6Y foreground delegation should produce this chain:

```text
MainAgentDecision
-> delegateTask request
-> policy accepted/rejected
-> AgentTask queued/claimed/running
-> RoleDispatcher run
-> AgentTaskResult
-> next MainAgentDecision
```

Background tasks must not interrupt the active demand conversation. In Phase 6S they do not enter the current demand confirmation queue. They may write closeouts, ledgers, generated indexes/cache, candidates, scores, reviews, and reports. Canonical docs, ECL, product roadmap, curated stable memory, and source root still require a separate human-gated apply path.

Role-scoped context projection is mandatory: planning/coder/validator/auditor/merge-reviewer roles do not receive the full maintenance memory store by default. Hot/warm/cold closeout windows are reserved for documentation, architecture, evolution, scorer, reviewer, and memory-maintenance roles.

## 7. Coding Work Package Boundary

The default coding assignment boundary is a Coding Work Package, not an individual TaskGraph node.

- One normal user demand conversation / internal Change should usually become one implementation package for one `coder-agent`.
- TaskGraph nodes are the accepted task checklist, evidence map, progress model, and future split candidates.
- Splitting by TaskGraph node is a later scheduler capability and requires dependency/conflict analysis, integration worktree, aggregate validation/audit, and rework handling.
- `coder-agent` may update business source in its isolated worktree proposal, but it must not directly mutate canonical ECL files, Harness memory, product docs, or role specs. For docs/Harness/memory changes it outputs a proposal, note, or evidence for a documentation/architecture/evolution role and human gate.
- In Phase 6E, `coder-agent` may run through Codex app-server to support live steer and interrupt inside the assigned worktree. The session is runtime continuity only; official validation/audit and human apply/merge gates remain outside the coder-agent.

This matches the reference lessons: oh-my-codex roles are coarse responsibility contracts with clear non-responsibilities; Symphony workers own one workspace attempt, but AHO maps the default coding attempt to a Change-level package until the TaskGraph has enough metadata for safe split and merge.

## 8. Multi-Agent Boundary

Future multi-agent work must coordinate through:

- declared role specs;
- accepted TaskGraph nodes;
- task assignments;
- TaskRun attempts;
- WorkerLeases;
- scoped Runs and worktrees;
- artifacts;
- validation/audit evidence;
- approvals and human decisions;
- durable memory.

It must not rely on one shared unbounded chat transcript as the collaboration mechanism.

Target binding for every agent run:

```text
projectId + changeId + taskId + roleId + taskRunId + runId + workspace/session
```

This gives the Workbench enough structure to answer: what is being worked on, who owns it, what evidence exists, what is blocked, what can be retried, and what decision is needed.

## 9. Agent Handoff Model

Agents hand off by writing durable evidence:

- Intake Agent -> intake scan/iteration and clarification records.
- Spec Agent -> proposal artifacts, then accepted `spec.md`.
- Planner -> proposal artifacts, then accepted `plan.md`, `tasks.md`, and `ac-map.json`.
- Coder -> worktree diff and implementation artifact.
- Validator -> validation artifacts.
- Auditor -> review artifacts.
- Integration Agent -> integration worktree and merge attempt artifact.
- IntegrationFix Agent -> repaired integration proposal and evidence.
- Merge Reviewer -> readiness verdict and risks.
- Documentation Agent -> documentation drift finding and proposal.
- Evolution Agent -> evolution proposal and result.
- Apply/Close -> decision artifacts.

The demand conversation should receive user-readable handoff summaries. The Workpad can summarize internal handoff state, but it must link back to the underlying artifacts.

## 10. Demand Agent Run Graph

Phase 6W introduced a read-only demand agent run graph as the user-facing evidence map for one selected demand conversation. Phase 6X pairs it with a Codex-style parent-agent transcript:

- `main-agent` is the root node and remains the only default user conversation surface.
- Planning, coder, validator, auditor, result review, integration check, IntegrationFix, merge reviewer, PR adapter, PR feedback, review handoff, remote landing, post-merge sync, and remote branch cleanup appear as delegated role/tool nodes when evidence exists.
- Documentation, architecture, evolution, scorer, reviewer, memory closeout, and other maintenance work can appear in a background lane when their artifacts exist.
- Node details may show why the parent agent invoked the node, input/output summaries, attempts, evidence refs, and raw-log entry points.
- Scoped feedback appears only when an existing real rework/reply path exists; the graph must not pretend to open a real SubAgent chat.

The transcript is derived from user messages, real assistant output when available, and compact tool-result summaries. It should not expose `TaskRepository`, `TaskRun`, `WorkerLease`, `DemandWorker`, or workflow labels as user-facing dialogue. Derived summaries must not pretend to be exact historical LLM output.

The graph visualization is derived from accepted artifacts, AgentTasks, AgentTaskResults, runs, validation/audit evidence, result review, integration/PR/landing/post-merge records, and maintenance artifacts. It is not a scheduler, not an editable workflow canvas, and not workflow truth.

## 11. Open Questions

- Whether project-defined roles live only in AHO memory, in project memory, or in both with precedence rules.
- Whether project-defined roles can be delegated before a user explicitly enables them.
- How much Codex app-server session continuity a future scheduler should preserve between related TaskRuns.
- Which future roles can safely use deterministic writers, and which must remain proposal-only.
