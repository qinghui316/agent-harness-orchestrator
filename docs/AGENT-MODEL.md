# Agent Model

## 1. Purpose

AHO already has bundled role profiles for Spec Agent, Planner, Coder, Validator, Auditor, and Spec-Test roles. Before multi-agent scheduling is added, these role definitions need a stable target model so orchestration does not hard-code behavior in one central prompt.

## 2. Current State

Today:

- bundled Markdown profiles define role behavior;
- commands choose which role profile to compose into a prompt;
- each role produces one proposal or one mechanical result;
- human confirmation advances high-impact state.

This is enough for single-role runs, but it is not yet a declarative orchestration model.

## 3. Future Declarative Spec

A future role or subagent declaration should state at least:

| Field | Meaning |
| --- | --- |
| `roleId` | Stable role identifier |
| `description` | When to use the role |
| `allowedInputs` | Facts or artifacts the role may read |
| `allowedOutputs` | Proposal or artifact types the role may produce |
| `writeCapability` | Read-only, worktree-write, or deterministic-writer |
| `preferredRuntime` | Codex, local command, future runtime adapter |
| `humanConfirmation` | Which outputs require accept/apply/close gates |
| `delegatable` | Whether future orchestrators may spawn it as a subagent |

This model should be serializable as durable project memory and readable by future schedulers and GUIs.

## 4. Relationship to Current Profiles

- Current bundled profiles remain the base role contracts.
- Future declarative specs reference or override those contracts; they do not replace the need for role prompts.
- Project memory may later override or extend bundled roles, but only through explicit memory rules and human-reviewed changes.

## 4A. Phase 5F Agent Runtime Bridge

Phase 5F adds an AHO-owned `agent_role` bridge modeled after oh-my-codex. Codex CLI does not need a native `--agent` flag. AHO resolves the role, reads the role Markdown, wraps it as system instructions, adds bounded ECL context and the task prompt, then calls normal `codex exec`.

```text
AHO role id
-> agents/{role-id}.md or bundled profile
-> ECL context packet
-> codex exec
-> run artifacts and provenance
```

Role, skill, and command responsibilities stay separate:

| Object | Responsibility |
| --- | --- |
| Role / Agent | Defines behavior, allowed inputs/outputs, write capability, gates |
| Skill | Reusable capability or knowledge discovered by Codex when relevant |
| Command | Workflow entrypoint such as spec propose, plan propose, code run |

AHO does not inject every enabled `SKILL.md` into every prompt. Skills are source files in AHO memory and runtime projections in the Codex bridge; Codex handles progressive skill loading when it can discover them.

## 5. Multi-Agent Boundary

Future multi-agent work must coordinate through:

- declared roles;
- scoped Runs;
- artifacts;
- approvals;
- durable memory.

It must not rely on one shared unbounded chat transcript as the collaboration mechanism.

## 6. Reference Alignment

AgentScope Java shows the value of declarative subagent specs and isolated worker contexts. AHO should borrow that shape, but preserve its own constraints:

- Codex-style executors remain external runtimes.
- Change stays above session as the business work unit.
- Human approval remains explicit.
- Role specs must encode Spec-Anchored boundaries, not only conversational personas.

## 7. Future Questions

- Whether role specs live only in AHO memory, in project memory, or in both with precedence rules.
- Whether project-defined roles can be delegated before a user explicitly enables them.
- How much runtime/session continuity a future scheduler should preserve between related Runs.
