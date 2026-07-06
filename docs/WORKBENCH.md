# Workbench

## 1. Purpose

The AHO Workbench should feel like a Codex-style development workspace, not a traditional admin console, ticket board, or raw agent terminal.

The user-facing model is:

```text
Project
  -> Demand Conversation
    -> Main planning conversation
    -> Execution process and result summary
    -> Evidence links
    -> Apply / merge decision
```

Internally, a Workbench conversation is only the chat window and transcript. A Harness Change is created or selected only by real planning/gate/action paths, and ECL artifacts, TaskGraph, runs, validation, audit, worktrees, and decisions remain workflow truth. Those internal objects support the product; they should not be the primary user vocabulary.

Users may delete a Workbench conversation record from the sidebar during the
testing-stage product flow. That operation removes the visible conversation /
transcript record only. It must not close, abandon, move, archive, or clean up
any Harness Change, ECL artifacts, run evidence, validation/audit, ResumePoint,
current gate, or source state. The project home stays a normal chat entry point:
a later conversation lets the main Agent read `AGENTS.md`, docs, and Harness
evidence to understand current project state rather than restoring a deleted
transcript or showing a separate "continue active work" entry.

Future Workbench direction is project conversation first: one project conversation may eventually link several related Changes when the main agent splits a broad user request. That is not the current runtime model. Current Workbench demand conversations already may create multiple active internal Changes under one project, so every selected-demand write-capable action, close/abandon action, result apply, and auto-finalize path must carry an explicit `changeId` target and avoid global active-state fallback.

The visual style is defined in `docs/UI-STYLE.md`. Static UI mockup prompts are maintained in `docs/design-prompts/workbench-ui-v1.md`.

## 2. Final Interaction Shape

The default interaction is one demand conversation:

```text
user demand
-> read-only project understanding when needed
-> main Agent explains understanding and delegates planning when needed
-> Plan session or real planning-agent conversation in the right Agent workspace
-> user feedback / revised plan in the owning Plan or child-agent workspace
-> explicit execution handoff back to the main Agent / runtime
-> coder-agent implements and self-tests in an AHO-owned worktree
-> optional live steering while coder is running
-> validator independently checks
-> auditor independently reviews
-> bounded automatic rework when validation/audit fails
-> result summary returns to the main conversation
-> user confirms apply/merge, requests changes, or abandons
```

This is the current default code-change template, not a universal agent-order rule. Future orchestration may let the main agent clarify, split, delegate, retry, or stop for user input in a different order, while write-capable actions and high-impact transitions still remain bound to Change, evidence, and human gates.

Future Goal-driven loop UX should keep that same user surface. The center
conversation should say what goal is active, what evidence changed, and why the
main Agent wants to continue, run sequentially, fan out low-conflict worktree
slices, wait, repair, or ask the user. The right confirmation queue should show
only the current real gate. Users should not have to understand TaskRun,
WorkerLease, SchedulerRun, WorkflowRun, recovery keys, or queue internals to
complete the demand. Those terms belong in Agent orchestration graph details, evidence
drawers, or developer docs.

For the chat-only Workbench center, the primary conversation must stay clean:
real user messages, real Codex/assistant output, compact delegation/result
activity rows, and short clarification strips only. It must not expose full
planning drafts, AC/task tables, raw artifact refs, Change ids, TaskRun ids, or
WorkflowRun ids as ordinary assistant prose. Planning-agent, coder, validator,
auditor, rework, and scheduler worker details belong in the right `Agent`
workspace and graph node details. Evidence should be reachable through the
right `Agent` / `确认` / `诊断` tools, compact activity row expansion, or the
Agent orchestration graph overlay. The graph remains a wide read-only
projection opened from the top tool button; it can explain main-agent decisions
and leaf-role results, but it cannot execute workflow actions.

The right rail separates interaction surfaces by responsibility. The center
conversation is the main Agent surface, so the right `Agent` workspace shows
only provider-owned Plan sessions and child-agent surfaces such as
planning-agent, coder, validator, auditor, rework, or scheduler worker. It
shows transcript / process rows, plan items, runtime question cards, feedback,
output summaries, and evidence refs for that selected surface. `确认` shows only real Harness
gates such as source apply, landing/close, Scheduler/IntegrationCheck,
remote/PR/merge, abandon/request-changes, or Harness evolution. Provider-native
Plan sessions are runtime conversation surfaces: they show plan text, question
cards, and user feedback, but they do not create a Harness Change, write a
planning bundle, or expose a Workbench planning action. The workspace is a
projection and scoped interaction surface, not workflow truth or a permission
system.

Provider runtime events are projected by ownership, not by parsing visible
assistant text. Ordinary main-agent chat must not start planning-agent by
keyword, fixed phrase, or Workbench-side guess. A child-agent or plan workspace
appears only when a real Harness action or provider runtime event carries a
clear owner such as role/session/thread/turn/item identifiers. Explicit owner
metadata wins; a single active turn may be used as a bounded fallback; ambiguous
multi-turn events must stay unassigned rather than being pushed into the main
conversation or the wrong Agent workspace.

Codex native Plan Mode is the preferred planning interaction. Native plan
deltas, plan updates, completed plan items, and runtime user-input requests
belong in the `plan-session` / Plan Agent workspace unless the provider emits
a real child-agent owner such as `planning-agent`. They are runtime interaction
events, not Harness gates and not canonical workflow truth. The older
`<proposed_plan>` proposal block is a replay/fallback path only and must be
labeled honestly when used.

The plan body itself is written by the Agent/runtime path. Workbench must not
turn a raw user request into invented goals, acceptance criteria, tasks, or a
workflow plan by rule. AHO can project provider events and preserve execution
boundaries, but it must not synthesize business planning artifacts from a chat
message or Plan Mode transcript. If the plan is incomplete, the Plan session
continues the conversation instead of showing a fake plan or hidden generated
bundle.

OpenSpec is the reference for the planning artifact flow. Proposal, spec,
design, tasks, and AC are artifacts produced by an Agent following project
rules, skills, and repository docs. They are not long assistant messages in the
parent conversation and not separate workflow truth. In normal conversation
mode, the Agent enters or updates Harness state by using the project rules and
tools; Workbench does not provide a product planning button, `latest-bundle`,
or hidden bundle promotion path.

Open Dynamic Workflows is the reference for deterministic workflow-as-artifact mechanics, not for the Workbench product surface. Phase 7H used only the proposal lesson: if a broad demand needs decomposition, the center conversation can show the main agent's DecompositionPlan in user language. Phase 7I adds a separate `DecompositionReadinessManifest` check after confirmation. Phase 7J uses that verdict as a gate: `ready-for-single-change` may expose `code.run`, while `ready-for-sequential-taskqueue-proposal` exposes TaskQueueProposal generation. Phase 7L adds a separate `WorkflowGraphPlan` compile action before confirmed queue start; graph compile is evidence and execution input, not execution. Phase 7K adds typed WorkflowRun progress recovery for that confirmed sequential queue. It still does not start a parallel scheduler, child Change, executable WorkflowPlan runtime, recovery replay from cached LLM output, or ODWF-style JavaScript script. Workflow scripts, resume keys, versioned graph refs, and raw orchestration internals belong in graph/details/evidence views, not the primary conversation.

Phase 6J adds bounded background execution across independent demand conversations. The user still works in one selected demand conversation at a time, but the project can show a small background summary such as `2 个处理中，1 个等待处理`. Background demand results must return to their own demand conversations; they must not appear in the selected conversation.

Phase 6K adds scoped apply readiness for those concurrent results. When the selected demand's result is still based on the current project state, the Inspector may offer `应用到项目`. When the project changed after that result was produced, the main conversation should say `项目已变化，需要重新处理这个结果` and offer a same-demand fresh rework attempt. Dirty local source state should offer status refresh or evidence, not automatic coder rework.

Phase 6L narrows the right pane into a confirmation queue. The center conversation explains what happened and summarizes tool results; the right pane only contains items that require human confirmation, such as confirming execution, checking compatibility for multiple ready results, applying a checked result set, requesting changes, or abandoning a result. Running state, raw evidence, worker details, maintenance logs, and technical diagnostics stay in details/evidence views.

Phase 6M keeps that interaction model. If a local compatibility check fails for a combined result, the parent conversation should explain that AHO is trying one bounded integration-layer repair. If the repaired result passes aggregate validation/audit, the right queue returns to `应用到项目`. If the repair fails or the budget is exhausted, the right queue shows only user decisions such as `要求修改`, `放弃`, and `查看证据`.

Phase 6N adds a local landing readiness step after the user has already applied a result to the local source root. The parent conversation should say that AHO is doing a `提交/PR 前检查`, then summarize the landing package and merge-reviewer verdict. The right pane may show a landing readiness item and evidence links, but it must not expose fake PR, push, remote merge queue, or landing queue actions.

Phase 6O adds the first real remote handoff. If the merge-reviewer verdict is ready and GitHub CLI capability is actually available, the right confirmation queue may show `创建 PR 草稿`. If remote, `gh`, auth, or permission is missing, the right pane should show configuration guidance instead of a fake create button. The center conversation must explain that a Draft PR is not merge/land/auto-merge and that future PR feedback handling is a later phase.

Phase 6P adds the first remote feedback loop. The parent conversation should explain what GitHub PR feedback/checks say, then describe the main agent decision: no action, optional user judgment, same-demand rework, provider unavailable, or stale PR. The right confirmation queue may show `检查 PR 反馈`, `根据 PR 反馈修改`, or `更新 PR 草稿`, but only when those actions have real backend paths. Updating a Draft PR is still only a branch/body update after a fresh landing review and user confirmation; it must not expose merge, land, ready-for-review, comment reply, or review-thread resolution controls.

Phase 6Q adds the ready-for-review handoff. The parent conversation should explain that the Draft PR has no actionable feedback or failed checks and can be submitted for human review. The right confirmation queue may show exactly one primary action, `提交人工评审`, only when provider readiness, draft state, feedback classification, and checks allow it. Submitting for review is not merge/land; the UI must not show reviewer assignment, comment resolution, auto-merge, merge queue, or landing controls.

Phase 6R adds thread-aware PR review feedback handling after the PR is in human review. The parent conversation should summarize reviews, checks, top-level comments, inline review comments, and any user-provided stance in normal language. Actionable feedback should become one same-demand rework context, not one agent per comment. Comments that need explanation should create an explicit reply draft; `回复评审` and `标记已处理` only appear in the confirmation queue when a real provider action exists. This stage still must not show merge, land, request-reviewer, auto-merge, or push-main controls.

Phase 6S adds background demand memory consolidation and doc drift guardrails. Terminal demands may generate closeouts, append maintenance ledger entries, refresh generated maintenance indexes/cache, and trigger a five-change maintenance review. These artifacts are not current-demand decisions. The parent conversation may show only light notices such as `后台已整理本次需求记忆` or `后台维护发现文档漂移候选，可在项目维护中查看`. The right confirmation queue must not show maintenance candidates unless a later human-gated product flow explicitly promotes a maintenance proposal.

Phase 6T adds the first remote landing action. The parent conversation should explain that PR readiness, reviews, and checks are evidence, while `合并 PR` is a high-impact user-confirmed action. The right confirmation queue may show `合并 PR` only for an explicit ready PR target. After success, the center conversation should say the PR was merged remotely and the local checkout was not automatically synced. Merge failure should show provider evidence and next status only; it must not show fake automatic repair, merge queue, branch cleanup, push-main, or local sync controls.

Phase 6U adds post-merge reconcile and optional cleanup. After a successful remote merge, the parent conversation should explain the remote PR state, current local branch, local dirty/clean state, whether fast-forward sync is safe, and whether the remote PR head branch can be cleaned up. The right confirmation queue may show `同步本地项目` only for a clean checkout already on the PR base branch with a fast-forward update available. It may show `清理远端 PR 分支` only when the remote PR head branch still exists and is safe to delete. It must not show checkout, stash, reset, rebase, implicit pull, push-main, local branch delete, auto-merge, or merge queue controls.

Phase 6V adds a project-level remote landing queue for multiple ready PRs. The parent conversation should explain how many PRs are ready, which PR is recommended next, and why other PRs need feedback/check handling or a later refresh. The right confirmation queue may show exactly one primary `合并 PR` action for the selected refreshed candidate, while other PRs remain folded as background queue items. After one merge succeeds, the parent conversation should explain that remaining PRs were refreshed before another confirmation. It must not show `合并全部`, unattended auto-merge, push-main, branch-protection bypass, local sync batch, or provider raw JSON.

Phase 6W introduced a read-only demand agent run graph. Phase 6X makes the center pane two inline tabs: `对话` and `Agent 编排图`. The `对话` tab is a Codex-style `ParentAgentTranscript`: user messages appear on the right, parent-agent messages appear on the left, and role/tool/system results appear as compact parent-agent tool-result blocks. The `Agent 编排图` tab shows one read-only graph for the selected demand conversation: `main-agent` is the root, planning/coder/validator/auditor/result review are primary role nodes, and scheduler workers, IntegrationCheck, integration outcome, landing, terminal, PR, and remote handoff are later projection nodes when evidence exists. Project maintenance is not default selected-demand graph content; maintenance evidence appears in project maintenance or evidence/detail projections. Clicking a node opens inline details with summaries, evidence refs, raw log entry points, and scoped feedback only when a real action path exists. The graph is a visual projection and does not execute actions.

Phase 6Y introduced a controlled `delegateTask` contract and process metadata. Phase 7A supersedes the default rendering rule: the `对话` tab no longer turns AHO role results, validation/audit evidence, PR/landing summaries, policy pass records, or maintenance notices into synthetic conversation prose. Those records remain builder inputs for graph/details/confirmation surfaces. The default conversation only renders real Codex runtime or `codex exec` replay cells.

Phase 6Z changes foreground role execution from a fixed backend role workflow into main-agent tool orchestration. The transcript should show the sequence as process rows: `main-agent 决定下一步`, `ToolPolicyGate 检查委派`, `调用 coder-agent`, `coder-agent 返回结果`, `边界审计通过/发现越界`, then the next main-agent decision. If runtime MCP loading is unavailable, the UI must say AHO used the controlled `orchestrator-policy` path and must not pretend a real MCP tool call succeeded. Policy/audit rows stay lightweight by default; details and raw evidence belong behind row detail, graph node detail, or Agent Loop.

Phase 7A changes the default transcript input from legacy block/items to `ParentAgentTranscriptCell[]`. The conversation tab must prioritize real Codex runtime cells: app-server notifications, assistant deltas, tool/item events, and `codex exec` JSONL/final-message replay. AHO orchestration, role returns, validation/audit, PR/landing, policy, and maintenance events must not synthesize main conversation body text. They belong in the Agent orchestration graph, node details, the right confirmation queue, or evidence drawers unless they are explicitly present in the Codex-visible runtime/replay stream. `turn/completed` updates state only; it must not create `处理完成`, `执行结果`, or equivalent prose. `codex exec` cells are replay-style, not live streaming.

Phase 7B tightens the renderer boundary. `ParentAgentTranscriptCell` rows are the only default conversation rendering source; frontend code must not append pending clarifications, live-turn fallback bubbles, planning/result cards, role pipeline rows, or maintenance cards directly into the `对话` tab. Command, MCP/tool, and file-change rows show only compact summaries such as `已运行 6 条命令`, `调用 MCP 工具`, or `文件已变更`; command text, stdout/stderr, cwd, exit code, tool arguments/results, diff previews, raw JSONL, and artifact paths belong in the row detail panel or graph/evidence views. Legacy thread items, role summaries, and result-review cards are builder inputs or detail views only.

Phase 7C splits Workbench loading. `getWorkbenchSnapshot()` is the first-screen shell for project/memory/repo, topic/workpad summaries, selected-demand light summary, confirmation queue, counters, refs, warnings, roles, and Harness gaps. Transcript, run graph, workpad/detail, evidence bundle, maintenance summary, and landing queue data load only when the user opens the relevant tab/detail. Live actions invalidate those loader caches. Cross-demand and demand-scoped actions must carry their target `changeId` and explicit target ids; the server rejects missing, stale, or forged high-impact targets against current derived state before executing.

Phase 7F keeps the same user-facing default code-change loop, but the backend role order is now selected by a deterministic main-agent decision engine. The Workbench may still show process rows for coder, validator, auditor, and bounded rework, but those rows are projections over `AgentTaskResult`, validation/audit evidence, boundary audits, and orchestration decisions. Validation or audit failure can start one automatic rework attempt; after that, the user should see a clear needs-input/result state rather than an unbounded invisible repair loop.

WorkflowRun recovery should appear as ordinary progress recovery, not as a trust decision. The Workbench may say that previously completed scoped work was reused after resume only when current Change, WorkflowGraphPlan, TaskQueueProposal snapshot, readiness manifest snapshot, accepted artifacts, source state, policy profile, and runtime capability still match. If any recovery key is stale, the UI explains that the workflow is blocked and needs user input. Reused progress remains evidence and does not skip validation, audit, or human apply/merge decisions. For sequential readiness the next-action chain is: generate TaskQueueProposal, compile WorkflowGraphPlan, confirm TaskQueue start, then resume/continue only with matching `workflowRunId + queueRunId`.

Phase 7M requires Workbench actions in that chain to preserve the full typed scope. TaskQueue resume and confirm-start payloads include proposal, graph, readiness, decomposition, workflow, and queue ids where applicable; the UI does not treat those ids as trust, but it must carry them so stale-target revalidation and audit evidence match exactly what the user confirmed.

Phase 7N kept the same Workbench behavior while starting the implementation boundary split. Phase 7O continued by separating server route/live/projection helpers, projection builders, frontend DTO/types, project panels, and selected chat action/live-transcript helpers. Phase 7P moved action execution and runtime-kernel boundaries behind compatibility facades. Phase 7Q moved Workbench DTOs and the first UI panel boundaries. Phase 7R completed the remaining projection-builder boundary. Phase 7S completed the Workbench chat boundary: action handlers, planning helpers, Codex chat bridge, and demand-worker helpers moved behind owned modules while Snapshot JSON, lazy projection JSON, action payloads, route shapes, live/cache behavior, thread logs, and audit scope remained compatible. Phase 7T completed the frontend surface boundary: `App.tsx` became the app shell, panels/renderers/payload helpers own their own surfaces, and CSS organization improved without redesigning the UI or adding runtime behavior. Phase 7W completed the Workbench server/API boundary split: server route dispatch, request/response helpers, direct/project-scoped route handlers, action/live endpoints, project admin, static serving, and native dialog helpers moved behind owned modules while preserving HTTP JSON, SSE, snapshot/lazy projection, action payload, and thread behavior. Phase 7X completed the read-model residual split: snapshot, workpad, task graph/task queue, result review, decision inspector, evidence/background/memory isolation, and lazy typed-workflow builders moved into owned read-model modules while preserving the same Workbench UI/API behavior. Phase 7Y completed the frontend residual surface split: remaining Workbench shell sidebar/thread/assistant/live helpers and Workpad planning/typed-workflow/task/evidence/action button surfaces moved into owned frontend modules while preserving the same UI, cache invalidation, action payload, and API behavior. Phase 7Z is outside the Workbench UI/runtime surface: it splits CLI command registration and domain type modules while preserving Workbench JSON/API/SSE/action/live behavior. Phase 8Q is the final broad Workbench action-handler ownership pass: `chat.ts` remains the conversation/action facade, while residual landing, PR, remote handoff, post-merge, landing queue, and conversation-control handler glue moves to owned action handler modules without changing Workbench JSON/API/SSE/action/live behavior.

Phase 8S adds a Workbench affordance for scheduler readiness only. When a selected demand is a parallel TaskGraph candidate with concrete scopes, Workbench may show "编译 Scheduler Contract" and a SchedulerContract summary. It must not show parallel start, queue, or run controls in this phase, and full contract details remain lazy-loaded evidence.

Phase 8Y extends that Workbench affordance with "生成调度预演" after a SchedulerContract exists. The UI may show dry-run summary fields such as wave count, estimated max wave width, blocked count, and prerequisite warnings, with full dry-run detail lazy-loaded. It still must not show parallel start, run, queue, worker-slot, lease, or scheduler controls.

Phase 8Z extends the same affordance with "编译 Worker Session Plan" after a SchedulerDispatchDryRun exists. The UI may show planned worker count, stage count, warning count, and recovery-key coverage, with full plan detail lazy-loaded. It still must not show parallel start, run, queue, worker-slot, lease, or scheduler controls.

Phase 9A extends the scheduler pre-execution affordance with "编译 Claim / Reconcile Plan" after a SchedulerWorkerSessionPlan exists. The UI may show wave count, claim intent count, max planned wave width, blocked count, and recovery coverage, with full plan detail lazy-loaded. It still must not show parallel start, run, queue, worker-slot, lease allocation, or scheduler controls.

Phase 9B extends the scheduler pre-execution affordance with "检查 Launch Preflight" after a SchedulerClaimReconcilePlan exists. The UI may show status, claim intent count, planned slot demand, blocked count, and human-gate requirement, with full preflight detail lazy-loaded. It still must not show parallel start, run, queue, worker-slot, lease allocation, ToolPolicy pre-authorization, or scheduler controls.

Phase 9C extends the scheduler pre-execution affordance with "准备 SchedulerRun" after a checked SchedulerLaunchPreflight exists. The UI may show SchedulerRun status, human-confirmed launch intent, claim intent count, planned slot demand, journal event count, and future gate requirements, with full SchedulerRun detail lazy-loaded. It still must not show parallel start, run, queue, worker-slot, lease allocation, WorkerSession, RuntimeWorkspace, EventSource, ToolPolicy pre-authorization, or scheduler controls.

Phase 9D extends the scheduler affordance with "初始化 Scheduler Runtime 壳" after a prepared SchedulerRun exists. The UI may show runtime shell status, wave count, claim intent count, blocked count, and last reconcile time, and may show "生成 Reconcile Snapshot" after initialization. Full runtime state and reconcile snapshot detail remain lazy-loaded. It still must not show parallel start, worker start, queue, slot, lease, WorkerSession, RuntimeWorkspace, EventSource, ToolPolicy pre-authorization, or scheduler execution controls.

Phase 9E extends the scheduler affordance with "预占 Runtime Claims" after a matching reconcile snapshot exists. The UI may show reservation status, reserved count, blocked count, wave index, source lock count, and superseded reservation id, with full reservation detail lazy-loaded. It still must not show parallel start, worker start, queue, slot, lease, WorkerSession, RuntimeWorkspace, EventSource, ToolPolicy pre-authorization, or scheduler execution controls.

Phase 9F collapses the ordinary scheduler confirmation surface into two user-facing Harness stage gates. After scheduler readiness, the right side should primarily show `准备并行执行计划`; this lets the main Agent fill the internal scheduler evidence chain and explain the plan in the main conversation. After the plan is prepared, the right side should show `确认启动这个并行执行计划`; this records the user's overall launch intent and produces a plain-language launch brief. The right side confirmation queue is a Harness phase gate, not a generic tool permission prompt, and ordinary users should not have to confirm internal checkpoints such as SchedulerRun preparation, runtime shell initialization, reconcile snapshots, or claim reservation one-by-one. Those internal artifacts remain available as lazy evidence/detail and for stale revalidation, audit, and recovery. Phase 9F still must not show parallel start, worker start, queue, slot, lease, WorkerSession, RuntimeWorkspace, EventSource, ToolPolicy pre-authorization, or scheduler execution controls.

Phase 9G adds the next user-facing Harness gate after launch confirmation: `启动第一个 worker`. This is intentionally singular. The Workbench may show which scheduler node/unit and coder stage was selected, plus the resulting TaskRun, WorkerLease, worktree, code run, and runtime-continuity status. It must not expose internal checkpoint buttons as the ordinary flow, must not show "start all" or full parallel controls, and must not imply that validation, audit, bounded rework, later waves, a scheduler loop, or slot allocator have started.

Phase 9H adds the next singular user-facing Harness gate after the first worker starts: `检查第一个 worker 结果`. The action reconciles the selected WorkerStart and its code Run evidence into scheduler-owned worker result evidence. The Workbench shows the node/unit, coder stage, TaskRun, WorkerLease, worktree, code run, and result status summary. Once terminal result evidence exists, the ordinary confirmation queue stops showing the same reconcile button. The UI still must not show validation, audit, bounded rework, "start next worker", "start wave", slot, lease, queue, or full parallel controls.

Phase 9I adds the next singular user-facing Harness gate after an evidence-ready first worker result: `验证第一个 worker 结果`. The action runs exactly one scoped Validation path against the worktree created by that first scheduler coder worker, then writes scheduler-owned validation evidence. Passed validation is still not task completion; the UI should show that audit is a later gate. Failed validation blocks the current scheduler worker path. The UI still must not show audit, bounded rework, "start next worker", "start wave", slot, lease, queue, apply, merge, or full parallel controls.

Phase 9J adds the next singular user-facing Harness gate after passed first-worker validation: `审计第一个 worker 结果`. The action runs exactly one scoped Audit path against the same worker worktree and exact validation run, then writes scheduler-owned audit evidence. Approved audit can complete that TaskRun; blocked/failed audit blocks only the current scheduler worker path. The UI still must not show bounded rework, "start next worker", "start wave", slot, lease, queue, apply, merge, or full parallel controls.

Phase 9K adds a non-executing Harness gate after first-worker validation failed or audit blocked/failed: `生成第一个 worker rework 计划`. The action writes scheduler-owned rework-plan evidence and shows a short summary of the blocking source, target worker/worktree intent, and required future gate. The UI must not show "启动 rework", next-worker, whole-wave, scheduler loop, slot, lease, apply, merge, or full parallel controls from this plan.

Phase 9L adds the next singular Harness gate after a scheduler rework plan exists: `启动第一个 worker rework`. The action starts exactly one scoped `rework-coder` on the original worker worktree and shows the rework TaskRun, WorkerLease, worktree, and code run summary. The UI still must not show rework result reconcile, validation, audit, next-worker, whole-wave, scheduler loop, slot allocator, IntegrationCheck, apply, merge, or full parallel controls.

Phase 9M adds the next singular Harness gate after that rework start exists: `检查第一个 worker rework 结果`. The action reads the rework code run, rework TaskRun, rework WorkerLease, and worktree evidence and shows whether the rework is still running, `evidence-ready`, or failed. The UI still must not show rework validation, rework audit, next-worker, whole-wave, scheduler loop, slot allocator, IntegrationCheck, apply, merge, or full parallel controls.

Phase 9N adds the next singular Harness gate after an evidence-ready rework result exists: `验证第一个 worker rework 结果`. The action validates the same reused worktree and shows scheduler-owned rework validation evidence. The UI still must not show rework audit, another rework, next-worker, whole-wave, scheduler loop, slot allocator, IntegrationCheck, apply, merge, or full parallel controls.

Phase 9O adds the next singular Harness gate after a passed rework validation exists: `审计第一个 worker rework 结果`. The action audits the same reused worktree, binds the audit to the exact rework validation run, and shows scheduler-owned rework audit evidence. The UI still must not show another rework, next-worker, whole-wave, scheduler loop, slot allocator, IntegrationCheck, apply, merge, or full parallel controls.

Phase 9P adds the next bridge gate after audit-approved scheduler worker output exists: `生成 scheduler integration 候选`. The action compiles `SchedulerIntegrationCandidate` evidence and shows ready target count, blocked output count, and ready worktree ids. If fewer than two ready targets exist, Workbench shows a waiting summary only. The UI still must not show IntegrationCheck, apply, merge, next-worker, whole-wave, scheduler loop, slot allocator, or full parallel controls in Phase 9P.

Phase 9Q adds the next bridge gate after at least two scheduler integration candidate targets are ready: `运行 scheduler IntegrationCheck`. The action delegates to the existing IntegrationCheck confirmation path with explicit target worktree ids and shows the resulting handoff evidence. It does not expose source-root apply/discard as scheduler actions, and it must not show next-worker, whole-wave, scheduler loop, slot allocator, landing, PR, merge, or full parallel controls.

Phase 9R adds the next bridge gate only after the existing IntegrationCheck has left `passed`: `记录 scheduler integration 结果`. When IntegrationCheck is still `passed`, Workbench continues to rely on the existing apply/discard confirmation queue and shows scheduler outcome as waiting. When IntegrationCheck becomes `applied`, `discarded`, or a blocked terminal status, Workbench records a scheduler-owned outcome summary and lazy evidence projection. This UI is an evidence mirror, not a second apply/discard surface.

Phase 9S adds the next worker gate only when existing scheduler worker paths are terminal and the latest integration candidate still needs another ready output: `启动下一个 worker`. Workbench must not expose internal scheduler checkpoints or whole-wave controls; the action starts at most one additional coder worker and then returns to the same result/validation/audit/rework gate sequence. Multiple scheduler worker paths must remain visible enough that a newer worker does not hide an unresolved older one.

Phase 9T repairs the Workbench scheduler surface after `start-next`: result, validation, audit, and rework confirmations should describe the selected current worker path rather than a first-worker singleton. When later approved worker outputs are not covered by the latest `SchedulerIntegrationCandidate`, Workbench must offer candidate refresh before starting another worker or running IntegrationCheck.

Phase 9U verifies that the Workbench can carry a second scheduler worker through the same current-worker surface. After the first approved worker output produces a waiting scheduler integration candidate, Workbench may show `启动下一个 worker`; after that worker is started, ordinary result, validation, audit, and rework labels must describe the current worker path, not a first-worker singleton. Once two approved outputs are available, the primary flow must refresh `SchedulerIntegrationCandidate` and only then expose existing scheduler IntegrationCheck handoff. The UI still must not show whole-wave dispatch, scheduler loop, slot allocator, start-all, apply, landing, PR, merge, child Change, or full parallel executor controls.

Phase 9V verifies the handoff after IntegrationCheck. When a scheduler handoff produces a passed IntegrationCheck, the right confirmation queue must still show the existing `确认应用到项目` / `放弃` IntegrationCheck actions. Scheduler outcome reconcile is a follow-up evidence action after that existing gate changes IntegrationCheck state; it is not a scheduler-owned apply/discard affordance and must preserve explicit target ids in action payloads and decision/audit scope.

Phase 9W keeps that user surface unchanged while adding SchedulerRun event/projection evidence for the integration bridge. The Workbench may show the candidate/handoff/outcome evidence trail in scheduler details, but it must not expose a new scheduler apply/discard button or make internal integration events look like user-required stages.

Phase 9X adds the final scheduler run status surface after terminal scheduler integration outcome: `记录 SchedulerRun 完成状态`. Once completion exists, Workbench should show a clear terminal scheduler summary and stop presenting scheduler start-next, IntegrationCheck handoff, or outcome reconcile as executable actions. Existing IntegrationCheck apply/discard confirmation remains the only user-facing source mutation gate while IntegrationCheck is still `passed`.

Phase 9Y verifies this Workbench surface end to end. The right-side confirmation queue must present only the action a user can understand at each stage: existing `确认应用到项目` / `放弃组合结果` while IntegrationCheck is `passed`, scheduler outcome only after apply/discard terminal state, and no executable scheduler follow-up once SchedulerRunCompletion exists. Internal scheduler artifact ids may remain in evidence/detail views but must not become ordinary primary user workflow.

Phase 9Z adds one more user-facing terminal option for the pre-IntegrationCheck dead end: when the scheduler candidate is blocked or exhausted, ready targets are still fewer than two, and there is no legal next-worker path, Workbench may show `结束本次 scheduler run`. Confirming it records SchedulerRun closeout evidence and a plain-language summary. It must not show IntegrationCheck/apply/merge controls, must not start another worker, and must not expose internal checkpoint buttons as the normal user workflow.

Phase 10A consolidates the ordinary scheduler execution surface after the Phase 9G-9Z execution slices. The right confirmation queue should present a small set of user-facing stage labels such as continuing the current scheduler plan, checking current evidence, handling a current blockage, checking combined results, completing the execution record, or marking the run unable to continue. These labels are presentation and decision clarity only: each confirmation still maps to one existing scoped scheduler action, preserves the full action payload and decision/audit target ids, and goes through ToolPolicyGate plus stale-target revalidation. The UI must not turn this consolidation into one-click start-all, automatic validation/audit/rework, start-next loops, whole-wave dispatch, slot allocation, scheduler-owned apply/discard, child Changes, or full parallel execution.

Phase 10B adds the Goal-driven Adaptive Loop interaction rule. The main conversation should explain the long-running goal, the current evidence, the next recommended step, and why a slice is safe to run in parallel or must wait. The right confirmation queue remains a Harness stage gate, not a generic permission popup and not a list of every internal artifact. If the user gives feedback, the main Agent revises the loop decision or plan; it must not silently start workers or merge outputs. The Workbench should keep this readable in the same Codex-style conversation instead of exposing raw loop internals as ordinary user workflow.

Phase 10C adds a scoped `planning.goal-loop.evaluate` action for recording the main Agent's loop decision. The center conversation may show a plain-language GoalLoopDecision summary and evidence link. The right confirmation queue must treat it as a non-executing evaluation gate: it may explain a recommended next action, but the recommended action itself remains a separate confirmation with its own explicit target ids. Goal-loop evaluation must not silently trigger scheduler plan preparation, worker start, IntegrationCheck, apply, close, or any other high-impact transition.

Phase 10D makes that gate visible only as a fallback. If the current demand already has a concrete planning, scheduler, IntegrationCheck, apply, landing, PR, or close confirmation, that concrete action remains primary and Goal Loop evaluation is hidden. If no concrete confirmation exists, the right side may show `评估目标循环`; confirming it records explanatory evidence and may cause the main conversation to explain the next legal step.

Phase 10E records each confirmed fallback evaluation as a Goal Loop iteration. The Workbench may show that an iteration was recorded, but it must not turn `recommendedAction` into a clickable fallback action. The user still confirms the specific next Harness stage separately.

Phase 10F makes the fallback wording more precise: confirming `评估目标循环` records a `GoalLoopDecision`, a `GoalLoopIteration`, and evidence-only continuation state. It still does not execute the recommendation or create a second action path. Concrete planning, scheduler, IntegrationCheck, apply, close, landing, or PR confirmations remain primary and suppress the Goal Loop fallback.

Phase 10G adds a continuation brief to the same fallback evaluation. The main conversation may show the brief as a readable explanation of what the next main Agent turn should re-read and why the current recommendation is only a separate Harness gate. The right-side queue must still show only the single `评估目标循环` fallback when no concrete action is available; it must not expose continuation briefs as separate buttons or silently continue the conversation.

Phase 10H exposes the latest Goal Loop decision/iteration/brief as a Workpad resume summary after a
snapshot reload. This is structured context for the main Agent and the user, not a new button or an
automatic continuation. The right-side confirmation queue still owns human-gated transitions, and a
Goal Loop recommended action must remain evidence until the corresponding scoped action is separately
available and confirmed.

Phase 10I lets that same Workpad summary include a `GoalLoopNextStepPacket` pointer and revalidation signal. The packet is for the main Agent's next explanation or planning turn. Workbench must not turn the packet into a new button, `workpad.nextAction`, hidden conversation turn, or scheduler execution path. If the packet recommends an action, the existing concrete confirmation still has to appear and be confirmed separately.

Phase 10J makes that next explanation more reliable by adding the latest valid packet to the main-Agent chat/orchestrator prompt context. The user still sees normal conversation text and the existing right-side Harness stage gates. Workbench must not expose a new `continue from packet` button or let packet context execute a recommendation.

Phase 10K improves the recommendation text behind that packet. When current scheduler evidence already points to a concrete right-side Harness gate, Goal Loop may name the same existing action and target ids. It must not create another confirmation item, hide the existing queue item, or turn a packet recommendation into an executable button.

Phase 10L aligns the packet with the visible Workbench state. If the latest packet is stale relative to current scheduler/runtime evidence, the Workpad Goal Loop summary and main-Agent context should hide it rather than showing an old `recommendedActionType`. The right confirmation queue remains the executable surface; a stale packet means the user or main Agent should record a fresh `planning.goal-loop.evaluate` if updated loop guidance is needed.

Phase 10M tightens that user-facing contract. Even a fresh packet is not enough to show a recommended action as current guidance: Workbench must also see the matching selected-demand Harness gate as the current enabled confirmation target. If the action type or packet target ids do not match the current gate, the packet is hidden/degraded and the user sees the real right-side gate instead. Packet recommendations must never create a duplicate button, reorder the queue, or satisfy a concrete action by falling back to `planning.goal-loop.evaluate`.

Phase 10N adds the user feedback path for that same contract. If the user rejects or qualifies visible Goal Loop guidance, Workbench may record scoped feedback and run a fresh non-executing Goal Loop evaluation. The UI should present this as "重新评估目标循环" evidence, not as approval to execute the old or new recommendation. Raw feedback must be shown as user evidence and must not become hidden system instructions or a shortcut around the right-side Harness gate.

Phase 10O makes that path explicit in the existing right-side confirmation surface. When Goal Loop guidance is visible because it matches the current concrete gate, the confirmation item may show a secondary `修正 Goal Loop 建议` action. The same inline feedback editor submits to `planning.goal-loop.feedback.evaluate` with the packet scope, while the primary gate remains separate. Workbench must not infer Goal Loop feedback from arbitrary composer/chat text, must not auto-confirm the primary action after feedback, and must not expose a second hidden execution surface.

Phase 10P tightens the post-feedback surface. After the user submits `修正 Goal Loop 建议`, Workbench should refresh to the new Goal Loop brief/packet summary and keep the concrete primary gate visible as the only executable step. The action result copy should say that feedback was recorded and the loop was re-evaluated, while execution still requires the separate Harness confirmation.

Phase 10Q may show a compact Goal Loop controller verdict beside the existing Goal Loop summary. The verdict explains whether the main Agent should recommend the current concrete gate, wait, suppress stale guidance, or treat the path as blocked. It must not create a new confirmation item, reorder the queue, auto-confirm the primary gate, or expose a hidden execution surface.

Phase 10R adds the explicit refresh surface for that verdict. When the visible Goal Loop packet already matches the current concrete Harness gate, the confirmation item may include a secondary `刷新 Goal Loop 控制策略` action. That action writes non-executing controller policy evidence for the same current gate; it does not confirm the primary action, create a duplicate primary item, reorder the queue, or execute a recommendation. If the packet or target ids no longer match the current gate, the refresh action must disappear or fail closed.

Phase 10S lets the same controller policy appear in main-Agent prompt context when Workpad projection still exposes the matching packet and policy. The main conversation can use it to explain the current safe posture in plain language, but the right-side concrete Harness confirmation remains the only executable transition. A missing or stale policy should degrade to packet guidance or a fresh Goal Loop evaluation, not to hidden execution.

Phase 10T verifies that actual main-Agent chat and orchestrator run artifacts match that surface. If the selected Workpad no longer exposes the same packet/policy, the Controller Policy section must not enter `context.md`, `prompt.md`, or `run.json.promptStack`. If it is current, those run artifacts may record the policy as prompt evidence so replay can explain why the main Agent saw it. This still does not create a new right-side action or let the main conversation execute the recommended gate directly.

Phase 10U lets that same prompt context include a concrete Harness gate handoff when the controller policy and the current right-side gate match. The main conversation may explain the gate action type and target ids as the next safe decision, but the right confirmation queue remains the only executable surface. The handoff must disappear when the policy is stale or mismatched, and it must not create duplicate buttons, auto-confirm the gate, or start scheduler/runtime work.

Phase 10V adds a secondary `准备 Goal Loop gate 预检` action to a matching concrete confirmation item. The action writes readiness evidence only after server-side stale revalidation and owner-module checks confirm the latest packet, controller policy, and current gate still match. It must not replace the primary confirmation, auto-confirm the concrete gate, call the concrete handler, or change the right-side queue into a Goal Loop execution surface.

Phase 10W allows a matching concrete confirmation item to carry that preflight id as assisted evidence. The button still represents the concrete Harness gate, not a Goal Loop execution action. Workbench must not show a duplicate primary action, must not submit `planning.goal-loop.*` to invoke a concrete gate, and must still require the same user confirmation on the concrete action.

Phase 10X makes the Workbench Goal Loop surfaces sensitive to accepted artifact content drift. If accepted `spec.md`, `plan.md`, `tasks.md`, or `ac-map.json` hashes no longer match the packet's source evidence, Workpad current recommendation, main-Agent prompt context, controller/preflight lineage, and assisted concrete confirmation must hide or fail closed instead of showing old guidance. The Workbench still does not add a new button or execution path for this freshness check.

The Workbench snapshot, transcript, and orchestration graph are projections, not workflow truth. The snapshot is a UI shell, the transcript must not show mechanical labels such as `AI 回复` or `执行结果`, and derived tool-result summaries must not pretend to be exact historical LLM text. The orchestration graph must not become the source of scheduling truth, must not create fake SubAgent chats, must not execute workflow actions, and must not move maintenance candidates into the right confirmation queue. The right side stays limited to human gates such as confirming execution, applying, checking compatibility, creating/updating PRs, submitting review, replying to review, merging, syncing, cleanup, requesting changes, or abandoning work.

Runtime boundary issues are explanation/evidence events, not confirmation queue items. When ToolPolicyGate denies a request or PostRunBoundaryAudit finds a role wrote outside its allowed scope, the main conversation should explain the user-impact in plain language and link evidence. The right queue should only show a user decision if there is a real next action such as requesting changes or abandoning the result.

For multiple ready demand results, the parent agent may suggest a local compatibility check before applying them together. The user confirms `检查兼容性`; AHO runs the check in a temporary integration worktree and returns the outcome as a tool result. A passed check creates a separate `确认应用到项目` item. A failed check creates request-changes/discard/evidence options. The check itself never modifies the source root.

## 3. Layout

```text
left sidebar                         center tabs                                  right confirmation queue
Global entries                       对话                                        Current human-gate item
Project folders                      Agent 编排图                                Evidence links
Nested demand conversations          Composer                                    Apply / merge decision
Pinned settings                                                                  Scoped feedback
```

### Left Sidebar

- Top global entries: new conversation, search, and only real available plugin/skill surfaces.
- Middle project folders: each project row expands to demand conversations under that project.
- Demand rows may show user-facing statuses such as `处理中`, `等待处理`, `等你确认`, `需要修改`, and `已完成`.
- Project menu: repository status, memory status, initialize Harness when needed, refresh project, create/add project actions.
- Bottom pinned settings.

The sidebar should not expose `Topic`, `Workpad`, `Change`, `TaskRun`, `WorkerLease`, `blocked`, or queue terminology as primary labels.
It also should not expose worker-slot, claim, or DemandWorker terminology; those are internal runtime details.

### Center

The center surface has two tabs:

- `对话`: the main parent-agent transcript.
- `Agent 编排图`: a lazily loaded read-only orchestration graph of the selected demand's parent-agent delegation, local loop, worker branches, integration joins, and terminal gates.

The conversation tab should show:

- user requests and follow-up feedback;
- visible Codex/main-agent assistant markdown exactly as runtime/replay recorded it;
- compact Codex command/tool/file-change/review-mode rows when runtime/replay recorded them;
- replay-style rows for `codex exec` JSONL/final-message events;
- errors only when the runtime/replay or AHO boundary check exposes a user-impacting failure.

The conversation tab should not synthesize planning drafts, role returns, validation/audit summaries, PR/landing summaries, maintenance notices, or generic completion text from AHO workflow state. Those belong in `Agent 编排图`, node details, the right confirmation queue, or evidence drawers unless they are literally present in the Codex runtime/replay transcript.

Agent Loop is no longer a default center tab. It remains available from graph node details or evidence details. It may show run ids, raw artifacts, logs, and internal runtime terminology because it is not the primary user decision surface.

When multiple demand conversations run concurrently, the center surface remains scoped to the selected demand. It may show a project-level background count, but it must not stream another demand's role results into the current conversation.

### Right Inspector

The right inspector is scoped to the selected demand conversation. It should summarize:

- the current plan or result;
- relevant role/result cards;
- strongest evidence;
- scoped feedback target;
- final apply/merge decision when available.

It is not a global approval list. It should not ask the user to accept every validation/audit result. Intermediate role output is evidence. The user decides whether to execute a plan, request changes, abandon a demand, or apply/merge a final result.

Maintenance closeouts, maintenance review windows, doc drift candidates, doc budget reports, generated-cache updates, scorer output, reviewer output, raw ledgers, and background maintenance logs do not belong in the right inspector. They should appear only in project maintenance or evidence/detail surfaces, unless a later phase creates an explicit user-facing maintenance proposal flow.

## 4. User-Facing Language Rules

Primary Workbench surfaces should use:

- `项目`
- `需求对话`
- `方案`
- `执行`
- `结果`
- `证据`
- `应用` / `合并`
- `需要修改`
- `处理中`
- `已完成`
- `稍后处理`

Primary Workbench surfaces should not use:

- `Topic`
- `Workpad`
- `Change`
- `TaskRun`
- `WorkerLease`
- `blocked`
- `audit-blocked`
- `queue blocked`
- `Approval Inbox`
- `Plan mode`

Internal terms may appear in developer docs, tests, APIs, storage, and Agent Loop / raw evidence contexts.

## 5. Core UX Rules

- A developer should understand the current demand, next required decision, and strongest evidence without opening raw files first.
- Planning happens in the `plan-session` / Plan Agent workspace or in a real
  provider-owned child-agent workspace; the main conversation keeps the parent
  Agent narrative and delegation/result process rows. There is no separate
  user-visible bottom Plan mode.
- If Codex app-server is active, running input is sent to the current planning/coder turn. If fallback is active, the UI must say the input is recorded for the next turn.
- A user confirming execution only agrees to implement the current plan; final source apply/merge still needs explicit confirmation.
- A user confirming a Goal-loop or scheduler stage agrees to one described Harness transition, not to an unbounded autonomous loop.
- Result review actions must be scoped to the selected demand result. A background demand result must not expose apply/discard decisions in the current conversation.
- Source drift is explained as `项目已变化，需要重新处理这个结果`, not as a raw git gate error.
- Coder self-test is allowed inside the assigned worktree, but official validation/audit remain independent evidence.
- Validation/audit failures should first trigger bounded automatic rework. Interrupt the user only for ambiguity, product tradeoff conflicts, environment problems, exhausted rework budget, or no real repair path.
- Archived demand conversations are read-only. Implementation follow-up creates a linked follow-up conversation.
- Agent activity visualization, when added later, remains a derived view over run and role evidence; it is not workflow truth.
- Parallel worktree slices are useful only when the main Agent can explain low conflict. High-conflict slices wait, run sequentially, or enter a fix loop.

## 6. Objects The GUI May Surface

| User-facing object | Internal binding |
| --- | --- |
| Project | Managed project registry entry |
| Demand Conversation | Topic/Change/Workpad binding and interaction log |
| Plan Session | Provider-native Plan Mode transcript or real child-agent planning conversation before implementation |
| Execution Result | Role pipeline run summaries and evidence |
| Evidence | Run artifacts, validation, audit, worktree state, decisions |
| Apply / Merge Decision | Human-gated source transition |
| Agent Loop | Technical evidence and replay surface |

## 7. Deferred Scope

The current Workbench does not implement:

- remote projects;
- full plugin marketplace;
- cross-project full-text search;
- true SubAgent chat runtime;
- parallel worker pool;
- executable WorkflowPlan runtime;
- dependency/conflict scheduler;
- always-on integration workspace beyond the existing scoped IntegrationCheck path;
- merge queue;
- agent animation.

## 8. Phase History

- Phase 5R made Workbench the default read model for a selected internal Change.
- Phase 5S added deterministic intake and clarification before Spec.
- Phase 5T through 5W added TaskGraph, TaskRun/WorkerLease, and local sequential queue projections.
- Phase 5X aligned right-side decisions with current blockers and evidence.
- Phase 5Y defined Coding Work Package as the normal coder-agent assignment grain.
- Phase 5Z added multi-demand projection and memory isolation.
- Phase 6A simplified user decisions and automatic finalization.
- Phase 6B added main planning-agent artifacts and the local role pipeline.
- Phase 6C made the left sidebar project-folder / demand-conversation based.
- Phase 6D aligned docs and primary UI terminology to this conversation-first model.
- Phase 6E added optional Codex app-server steering/interrupt for planning-agent and coder-agent turns, with `codex exec` fallback.
- Phase 6F added Result Review + Apply Handoff: after coder / validation / audit evidence exists, the main conversation and right inspector summarize changed files, validation, audit notes, apply readiness, and the final local action.
- Phase 6G adds AgentTaskRepository projection: foreground role handoffs and background maintenance candidates are visible as task/result evidence, while the primary user surface remains the demand conversation.
