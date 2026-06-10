# Reference: AgentScope 2.0

## Source

- Source repo: `https://github.com/agentscope-ai/agentscope`
- Local path: `reference-projects/agentscope/`
- Inspected commit: `0e5418e81c1550c8bd2a32e927e27ff1cb13578c`
- Reference status: local ignored source reference. Do not vendor-copy into AHO product code.

## Inspected Areas

| Area | Reason |
| --- | --- |
| `README.md` | AgentScope 2.0 positioning, event/permission/service/workspace claims, and quickstart shape |
| `examples/agent_service/README.md` | Multi-tenant / multi-session service and permission UI behavior |
| `examples/agent_service/main.py` | Example service wiring, workspace manager, permission context, and team worker prompts |
| `src/agentscope/event/` | Event types and streamable frontend/HITL units |
| `src/agentscope/message/` | Message reconstruction from event streams and block semantics |
| `src/agentscope/permission/` | Permission context, decision, rule, and behavior model |
| `src/agentscope/workspace/` | Workspace abstraction for tools and isolated execution |
| `src/agentscope/app/` | Agent service, session/team records, background tool offload, storage, routers, and workspace managers |

## Runtime / Service Lessons

AgentScope 2.0 is the current Python mainline reference for production agent framework and service concerns. Its README explicitly highlights:

- event system;
- permission system;
- multi-tenancy and multi-session service;
- workspace / sandbox support;
- extensible middleware.

For AHO, this is not a replacement for the Spec-Anchored Harness Kernel. It is a reference for how mature agent runtimes separate long-lived service concerns from a single model turn.

## Event And Message Boundary

AgentScope separates stream events from accumulated message state. The event layer contains typed units for reply/model/tool/text/thinking/data blocks, permission requests, external execution, user confirmation, and custom state changes. Message code can reconstruct content from event streams.

AHO mapping:

| AgentScope concept | AHO future mapping | Boundary |
| --- | --- | --- |
| `EventType` stream | future `AgentEventEnvelope` | Runtime/UI replay only; not workflow truth. |
| message reconstructed from events | Workbench transcript cell / replay projection | User-readable view, not source authority. |
| permission and external execution events | ToolPolicyGate / Workbench confirmation / external execution protocol | Must remain human-gated for high-impact actions. |
| custom state-change events | worker/session status events | Derived coordination evidence only. |

This supports a future AHO event source model for parallel workers: parent events, worker events, and background tool results need source metadata and replay semantics before AHO starts true parallel execution.

## Permission Boundary

AgentScope's permission package models permission mode, rules, decisions, and tool-level behavior. The agent service example demonstrates session-level permission context, including modes that can ask or bypass.

AHO should borrow the separation of:

- permission policy;
- permission request event;
- user or system decision;
- tool execution result.

AHO must not copy permissive bypass behavior into high-impact development workflow paths. Apply, merge, close/archive, Harness evolution, PR mutation, scheduler execution, and source mutation must remain gated by AHO ToolPolicyGate, stale-target revalidation, validation/audit evidence, and human confirmation.

## Workspace / Sandbox Boundary

AgentScope 2.0 treats workspace and sandbox support as first-class runtime infrastructure. Tools and code can run in isolated environments with local, Docker, and E2B-style backends.

AHO mapping:

| AgentScope concept | AHO future mapping | Boundary |
| --- | --- | --- |
| workspace | future `RuntimeWorkspace` | Execution substrate; not Change truth. |
| sandbox backend | local worktree / Docker / remote worker adapter | Must preserve source-root apply gates. |
| tool filesystem | scoped worktree or sandbox filesystem | Cannot write source root directly. |
| workspace manager | resolver over AHO memory/worktree/sandbox roots | Must enforce project/change/worktree scope. |

AHO already has Worktree metadata and source-root apply guards. A future sandbox layer should sit under the code/worker runtime and above tool execution, not replace validation, audit, integration, or human gates.

## Multi-Session Service And Agent Team

AgentScope's service model treats users, sessions, workspaces, agents, and teams as persistent service records. The team model lets a leader spawn worker sessions and exchange messages through built-in team tools. Worker sessions have their own state and can be displayed separately.

AHO mapping:

| AgentScope concept | AHO future mapping | Boundary |
| --- | --- | --- |
| session record | future `WorkerSession` / expanded `AgentSession` | Runtime auxiliary only. |
| team leader | MainAgent / selected demand orchestrator | Cannot replace Change/ECL or human gates. |
| team worker | leaf role worker session | Must receive scoped RoleContextPacket. |
| background tool offload | bounded background execution evidence | Must not mutate canonical files silently. |
| wakeup / inbox | Workbench event/replay and worker continuation signal | Must be scoped to demand/change/session. |

This is important for AHO's post-8S path: `SchedulerContract` describes readiness and waves, but the executor should not start parallel workers until AHO has a scoped session/workspace/event/permission/recovery contract.

## Borrow Now

1. Treat event streams and reconstructed messages as separate layers.
2. Model permission requests as explicit runtime events with durable decisions.
3. Keep workspace/sandbox as a pluggable execution substrate.
4. Treat worker/team sessions as runtime auxiliary records, not workflow truth.
5. Require source metadata on forwarded child/worker events.

## Borrow Later

1. A service-level session store when AHO moves beyond local Workbench execution.
2. Background tool offload and wakeup semantics for long-running worker tasks.
3. Agent-team UI affordances after AHO has scoped worker sessions and scheduler leases.
4. Pluggable sandbox backends after worktree-only execution reaches its limits.

## Do Not Copy

1. Do not replace AHO's Change/ECL product authority with AgentScope session/team state.
2. Do not implement free-form team spawning before AgentSpec, ToolPolicyGate, and scheduler contracts exist.
3. Do not adopt permission bypass modes for high-impact source, merge, close, or Harness evolution paths.
4. Do not vendor-copy AgentScope Python runtime code into AHO product modules.
5. Do not treat AgentScope's general-purpose agent service as AHO's user-facing product model.

## Implications For AHO

- Phase 8S was the right boundary: SchedulerContract is readiness evidence, not an executor.
- The next runtime design should define `AgentEventEnvelope`, `WorkerSession`, `RuntimeWorkspace`, permission/external-execution events, and recovery keys before true parallel execution.
- Workbench should eventually show worker event sources and session continuity, but default demand conversation must remain user-facing and spec-anchored.
- AHO should keep Codex and other agents behind adapters rather than importing an in-process AgentScope runtime.
