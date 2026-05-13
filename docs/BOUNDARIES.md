# Boundary Decisions

Agent Harness Orchestrator is a local-first, personal-first, Spec-Anchored managed-run harness for AI coding.

This document records boundaries that are expensive to change later. It is not a roadmap, implementation plan, or feature checklist.

## 1. Product North Star

AHO is not primarily a multi-agent scheduler. It is a project-linked memory and execution harness that keeps human intent, specs, tests, code, validation, review, and Harness evolution connected.

The long-term product chain is:

```text
Spec -> Acceptance Criteria -> Plan -> Tasks -> Context Projection
-> Disposable Agent Run -> Events / Artifacts -> Validation / Review
-> Archive -> Evolution Evidence
```

The product should make AI coding controllable, reviewable, and recoverable. Faster code generation is useful only when it stays anchored to durable project memory and human-confirmed decisions.

## 2. Personal-First and Local-First Boundary

The primary user is an individual developer managing local repositories with tools such as Codex CLI, Claude Code, and shell commands.

Decisions:

- Project files, AHO-managed memory, run artifacts, and evidence are local-first.
- Projects must explicitly opt in before AHO writes to them.
- Team permissions, cloud sync, remote workers, and shared hosted state are deferred.
- Local workflows should not require a server, database daemon, or cloud account.
- Future team mode must build on the same memory interfaces instead of replacing them.

## 3. Spec-Anchored Boundary

The near-term target is L2 Spec-Anchored development, not immediate L3 Spec-as-Source development.

Definitions:

- L1 Spec-First: write specs before implementation, but specs may drift.
- L2 Spec-Anchored: keep specs, acceptance criteria, tests, code, and validation continuously linked.
- L3 Spec-as-Source: humans edit specs and code is generated or maintained from specs.

Decisions:

- Change is the workflow unit.
- Spec is the semantic anchor.
- Acceptance Criteria are the validation anchors.
- Run is an execution attempt.
- Artifact is auditable evidence.
- L2 is the practical product target for upcoming phases.
- L3 is a future experiment and must not be implied by current UX or docs.

## 4. Project Memory Boundary

Project memory must live in durable AHO-managed stores, not in agent chat, hidden model state, or a single runtime session.

AHO has three memory modes:

| Mode | Source of truth | Boundary |
| --- | --- | --- |
| `repo-local` | Target repository files | Current implementation and compatibility mode |
| `external-local` | AHO home on the user's machine | Personal default target |
| `remote` | Remote memory service | Future team/cross-device authoritative source |

`repo-local` is retained for compatibility, migration, portable exports, and projects that intentionally want Harness history in Git. It is not the long-term default for personal multi-project use.

`external-local` is the target personal default. The project keeps a marker and a memory map, while durable memory lives outside the business repository under AHO home.

`remote` is future team mode. In remote mode the remote service is authoritative and the local store is a cache.

Current repo-local memory locations:

```text
AGENTS.md                 routing map
docs/                     durable product, architecture, and boundary knowledge
harness/changes/          specs, plans, tasks, reviews, archive history
.agent-harness/runs/      events, logs, diffs, validation reports, run artifacts
harness/evolution/        evidence, proposals, results, controlled evolution state
```

Decisions:

- `AGENTS.md` is a map, not a memory database.
- `docs/` and Harness artifacts preserve durable project knowledge in the active memory store.
- `context.md` is a per-run projection and is not source of truth.
- Chat transcripts can inform work, but they are not durable project state unless summarized into files.
- Future dashboards and indexes must derive from AHO-managed memory rather than replacing it.
- External-local and remote memory must be accessed through Memory Resolver / Memory Store boundaries, not through hardcoded repo-local paths.

## 5. AGENTS.md Routing Boundary

`AGENTS.md` is the first routing document for agents entering a project.

Its job is to tell an agent where to read:

- product facts
- architecture decisions
- ECL rules
- current active change
- pending evolution
- validation commands
- task-specific docs

Decisions:

- `AGENTS.md` should stay compact and navigational.
- `AGENTS.md` should identify the memory mode and marker location.
- `AGENTS.md` should describe how to resolve durable memory, without embedding private paths or secrets.
- Detailed rules belong in `docs/` or Harness files.
- AHO may generate `context.md` for a specific run so Codex-style tools receive the necessary context even if they do not automatically follow the full routing chain.
- If durable memory is unavailable, `AGENTS.md` should instruct agents not to infer hidden history and to ask for memory attach, sync, init, or repair.

## 6. Memory / Execution Separation Boundary

AHO treats Codex-style agents as disposable executors. It does not assert that Codex, Claude Code, or another tool is internally stateless.

Decisions:

- AHO must not depend on agent-internal memory, hidden sessions, or internal tool traces.
- Each run rebuilds context from Harness memory and writes results back as artifacts.
- Agent outputs are proposals until validated, reviewed, and confirmed by a human.
- Agents communicate through files, events, diffs, validation reports, and review artifacts, not through shared chat context.
- If a runtime exposes richer session APIs later, those APIs are adapters, not the source of project truth.

## 7. Memory Unavailable Boundary

Memory can be unavailable on a new machine, after a plain repository clone, when AHO home was not synced, when permissions are missing, or when a future remote memory service is offline.

Decisions:

- A marker without resolvable durable memory is an incomplete project context.
- Agents must not invent active changes, archive history, or prior decisions.
- Agents may read public repository docs and source for low-risk analysis.
- High-impact work should pause until memory is attached, synced, initialized, or repaired.
- Missing memory is a product state to surface, not a reason to silently fall back to chat history.

## 8. Human Confirmation Boundary

Every high-impact agent output requires human confirmation before it changes the next critical state.

Confirmation gates:

- Spec Agent output requires human confirmation before planning depends on it.
- Planner Agent output requires human confirmation before coding starts.
- Coder diff requires validation, audit, and human confirmation before apply or merge.
- Validator failure blocks close by default.
- Auditor approval is not merge authority.
- Close/archive requires human confirmation.
- Harness evolution proposals require human confirmation before applying.

Decisions:

- Agent output is a proposal, not a command.
- AHO can automate preparation, execution, validation, and evidence collection.
- Humans retain final decision authority at spec, plan, apply/merge, close, and evolution gates.

## 9. Change / Run / Artifact Boundary

A Change is the user-visible unit of work. A Run is one execution attempt against a Change.

Relationship:

```text
Project -> Change -> Run -> Events / Artifacts
```

Decisions:

- A Change may have multiple runs.
- A failed run must not erase change history.
- Artifacts should be durable enough for review, resume, dashboard display, and evolution evidence.
- Run artifacts should include context projection, events, logs, diffs, validation results, and review outputs where available.
- Archive history is evidence for future Harness evolution.

## 10. Worktree vs Container Boundary

Worktree isolation is the default direction for local code-change isolation.

Worktrees provide:

- independent file trees
- independent diffs
- reduced pollution of the main working tree
- easier review and discard
- possible parallel runs

Worktrees do not provide:

- process isolation
- network isolation
- environment-variable isolation
- credential isolation
- dependency sandboxing
- OS-level security boundaries

Decisions:

- Worktree is a code-change isolation layer, not a complete security sandbox.
- Phase 2/3 should converge toward worktree execution for coding and Harness evolution.
- Direct execution may exist only as an explicit local convenience mode.
- Container sandboxing is a future optional layer for higher-risk, team, or remote execution scenarios.
- Automatic merge is out of scope until explicitly added behind human approval gates.

## 11. Codex-Style Executor Boundary

Codex CLI, Claude Code, and similar tools are external runtimes.

What AHO can reasonably do:

- generate a context projection
- choose the working directory or worktree
- invoke a process
- capture stdout and stderr
- record start and end state
- collect git diff
- run validation commands
- ask another agent or human to review outputs

What AHO must not rely on:

- hidden runtime memory
- exact internal reasoning
- exact internal tool-call sequence
- runtime-specific session continuity
- complete isolation from local files unless an actual sandbox exists

Fallback strategy:

- Use `context.md` instead of runtime memory.
- Use events, logs, diffs, validation, and review artifacts instead of internal traces.
- Use worktrees and explicit cwd boundaries instead of assuming sandbox safety.
- Use human confirmation gates for high-impact decisions.

## 12. Validation and Auditor Boundary

Validation and audit are separate gates.

Validation answers whether commands and checks passed. Audit answers whether the change appears correct, aligned with the spec, and safe to apply.

Decisions:

- Validation results should be mechanical and artifact-backed.
- Validation is scoped to a Change and must not be treated as project-wide blanket approval.
- In early phases, no validation is warning-only while latest failed validation is blocking.
- Auditor output is a proposal and cannot apply or merge by itself.
- A Coder run that passes validation can still be rejected by audit or human review.
- A failed validation should produce evidence for fixing code, improving specs, or evolving Harness rules.
- Spec-linked validation starts as warnings until the mapping model is mature enough to fail CI reliably.

## 13. Harness Evolution Boundary

Harness evolution improves the collaboration system, not business code directly.

Allowed evolution targets:

- process rules
- templates
- ECL guidance
- lint checks
- validation defaults
- documentation
- agent routing guidance

Decisions:

- Evolution evidence comes from archived changes, validation failures, repeated user corrections, spec drift, weak acceptance criteria, and review findings.
- Evolution must use evidence, proposal, review, validation, and human approval.
- Evolution must not automatically edit business code.
- Evolution must not silently rewrite business specs.
- No independent review means no automatic apply.

## 14. Public Repo vs Local Harness Boundary

The open-source repository should remain a usable product repository, not a dump of local agent work history.

Public assets:

- product source code
- public docs
- tests
- templates
- package and build configuration

Local development state by default:

- active and archived local changes
- reference project checkouts
- run logs and events
- worktrees
- local registry
- temporary artifacts

Decisions:

- Product Harness templates are public assets.
- This repository's own local Harness workspace is development state.
- Publishing internal ECL history is optional and must not be required for users to clone, install, or understand the product.
- External-local memory strengthens this boundary by keeping private run history and project-specific agent state outside the business repository.
- Project markers must not contain secrets, user home paths, or machine-specific credentials.

## 15. Deferred Boundaries

These areas are intentionally deferred:

- team permissions
- cloud sync
- remote managed agents
- remote memory gateway/server
- cross-project knowledge memory
- hosted dashboard
- container sandbox by default
- credential vault implementation
- automatic merge
- full Spec-to-Test generation
- CI drift failure gates for all changes
- L3 Spec-as-Source workflow

Each requires a future architecture decision before implementation.

## 16. Current Defaults

Current defaults:

- local-first
- personal-first
- explicit opt-in
- Change-driven workflow
- Spec-Anchored direction
- repo-local Harness/docs/artifacts as current implementation
- external-local as the target personal memory mode
- remote memory deferred as future authoritative team mode
- Codex-style tools treated as disposable executors
- worktree isolation as the preferred direction
- all high-impact agent outputs require human confirmation
- no automatic merge
- no automatic Harness evolution apply
- public repo excludes local Harness runtime history by default
