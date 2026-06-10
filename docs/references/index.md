# References Index

Reference projects are included as git submodules under `reference-projects/`. Read the matching map before reading source. When a task asks to "look at reference projects", inspect the relevant source, tests, config, or hook files for the specific mechanism being discussed; do not stop at conceptual map alignment.

| Reference | Source | Local Path | Map |
| --- | --- | --- | --- |
| Agent Orchestrator | `https://github.com/ComposioHQ/agent-orchestrator` | `reference-projects/agent-orchestrator/` | `docs/design-docs/ref-agent-orchestrator.md` |
| AgentScope | `https://github.com/agentscope-ai/agentscope` | `reference-projects/agentscope/` | `docs/design-docs/ref-agentscope.md` |
| AgentScope Java | `https://github.com/agentscope-ai/agentscope-java` | `reference-projects/agentscope-java/` | `docs/design-docs/ref-agentscope-java.md` |
| Open Design | `https://github.com/nexu-io/open-design` | `reference-projects/open-design/` | `docs/design-docs/ref-open-design.md` |
| OpenAI Codex | `https://github.com/openai/codex` | `reference-projects/openai-codex/` | `docs/design-docs/ref-openai-codex.md` |
| Open Dynamic Workflows | `https://github.com/imsai-sh/open-dynamic-workflows` | `reference-projects/open-dynamic-workflows/` | `docs/design-docs/ref-open-dynamic-workflows.md` |
| OpenAI Symphony | `https://github.com/openai/symphony` | `reference-projects/symphony/` | `docs/design-docs/ref-symphony.md` |
| OpenSpec | `https://github.com/Fission-AI/OpenSpec` | `reference-projects/openspec/` | `docs/design-docs/ref-openspec.md` |
| oh-my-codex | `https://github.com/sigridjineth/oh-my-codex` | `reference-projects/oh-my-codex/` | `docs/design-docs/ref-oh-my-codex.md` |
| ecl-harness-engineer | `https://github.com/qinghui316/ecl-harness-engineer` | `reference-projects/ecl-harness-engineer/` | `docs/design-docs/ref-ecl-harness-engineer.md` |
| AGENTS.md practice article | `https://mp.weixin.qq.com/s/fBBBSfQajYjYtngZAitZCA` | Web article | `docs/references/agents-md-practice.md` |

Do not vendor-copy reference code into this repository. Update submodule pointers only through ECL changes.

## Choose Reference By Problem

| Problem | Read First | Why |
| --- | --- | --- |
| Queue, dispatch, retry, blocked, reconcile, runtime dashboard | `docs/design-docs/ref-symphony.md` | Symphony demonstrates orchestrator-owned worker lifecycle and status projection. |
| Runtime event/message streams, permission requests, workspace/sandbox adapters, multi-session service, and agent team | `docs/design-docs/ref-agentscope.md` | AgentScope 2.0 shows the current Python runtime/service direction for agent events, permissions, sessions, workspaces, and worker teams. |
| Draft PR handoff, human review, PR feedback, landing boundary | `docs/design-docs/ref-symphony.md` | Symphony separates push/PR, human review feedback/rework, and landing/merge; AHO 6O/6P/6Q borrow Draft PR handoff, feedback rework, and ready-for-review handoff without merge. |
| Main-agent task repository, foreground/background task delegation | `docs/design-docs/ref-agentscope-java.md` and `docs/design-docs/ref-symphony.md` | AgentScope shows task repository/subagent separation; Symphony shows dispatch/reconcile policy. |
| Background memory maintenance, documentation drift, consolidation candidates | `docs/design-docs/ref-agentscope-java.md` | AgentScope's ledger plus consolidator pattern maps to AHO maintenance ledger and human-gated candidates. |
| Subagent specs, workspace/session separation, task repository | `docs/design-docs/ref-agentscope-java.md` | AgentScope shows independent subagent context, Markdown-like specs, task state, and workspace boundaries. |
| Codex exec, JSONL, app-server runtime boundary | `docs/design-docs/ref-openai-codex.md` | Codex defines the external executor and app-server boundary AHO should adapt to. |
| Demand clarification, proposal/spec/design/tasks artifact flow | `docs/design-docs/ref-openspec.md` | OpenSpec shows a lightweight, iterative planning layer before implementation. |
| Deterministic WorkflowPlan shape, pipeline/barrier semantics, run events, and resume journal | `docs/design-docs/ref-open-dynamic-workflows.md` | Open Dynamic Workflows shows how a main model-authored workflow artifact can fan out bounded leaf agents while preserving evented progress and recoverable execution. |
| Workbench UI, readable tool cards, local daemon pattern | `docs/design-docs/ref-open-design.md` | Open Design shows local web/daemon projection and readable activity UI. |
| Role prompt files, command/skill organization, review-role structure, hook/permission boundaries | `docs/design-docs/ref-oh-my-codex.md` | oh-my-codex demonstrates practical role prompts, Task-style delegation, worker preambles, PreToolUse/PermissionRequest/PostToolUse hooks, and post-execution permission scans. |
| Worktree and dashboard implementation patterns | `docs/design-docs/ref-agent-orchestrator.md` | Agent Orchestrator provides operational patterns for worktrees and runtime status. |
| Current ECL lifecycle, fixed-window Harness evolution, active-change hygiene | `docs/design-docs/ref-ecl-harness-engineer.md` | ecl-harness-engineer is the current compatibility baseline for structured changes and evolution. |

Reference projects are evidence. Do not copy their product authority model into AHO unless an AHO architecture decision explicitly accepts it.
