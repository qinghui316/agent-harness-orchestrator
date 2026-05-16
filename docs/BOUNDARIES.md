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

## 6A. Codex Skill Bridge Boundary

AHO may use Codex plugin and skill discovery as a runtime delivery mechanism, but AHO skill memory remains authoritative.

Decisions:

- `skills/{skill-id}/SKILL.md` under the resolved memory root is the skill source of truth.
- SQLite records skill enablement and bridge sync state.
- `~/.codex/plugins/aho-managed` is a rebuildable runtime projection.
- AHO must not overwrite user Codex skills, oh-my-codex skills, or global Codex configuration.
- Bridge install/sync is explicit; runs may warn when the bridge is out of sync but must not secretly write to `~/.codex`.
- Imported skills do not execute scripts in Phase 5E.
- Runs record enabled skill ids and hashes so Codex behavior can be audited later.

## 6B. ECL Agent Runtime Boundary

ECL is the workflow protocol and canonical project record. It is not a single mega-prompt and must not be reduced to a Codex skill.

Phase 5F introduces an AHO-owned agent runtime bridge:

- AHO selects `agent_role`.
- AHO reads `agents/{role-id}.md` from memory or bundled profiles.
- AHO validates role write capability and required gates.
- AHO sends role instructions, bounded ECL context, and the user/task prompt to Codex.
- Codex executes the scoped run and emits artifacts.

Skills remain discoverable runtime capabilities. AHO must not inject all enabled skill bodies into every prompt. Enabled skills are recorded as available provenance; actual skill usage is only recorded when observable evidence exists.

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

## 10. Workbench Boundary

The personal GUI is a change-centered workbench.

Decisions:

- The user-facing label is `Topic`; the domain object is `Change`.
- One Topic maps to one Change in the first GUI.
- Durable free-chat topics outside Change are out of scope, but each Topic may have a continuous chat surface.
- Ordinary Topic chat is read-only. It can answer questions and clarify context, but it must not mutate canonical ECL files or business code.
- Thread View is a narrative projection over Topic chat, Change facts, Runs, and decisions.
- Agent Loop View exposes run-level streaming, tool/event detail, future replay, and future interrupt/cancel controls.
- A cancelled or interrupted Run does not close the owning Change.
- GUI snapshots are derived views and must not become a second workflow database.

## 11. Thread / Run Boundary

Topic Chat, Thread View, Run, and Session are different objects.

Decisions:

- Topic Chat is the interaction record for one Change. It is persisted for continuity but is not the accepted specification.
- Thread View is the user-facing narrative projection over Topic chat, accepted Change facts, Runs, artifacts, and approvals.
- Run is the executable attempt with live events, stream output, artifacts, and future interrupt/cancel controls.
- Codex Session IDs may exist as runtime helpers for ordinary chat continuity, but they must not replace Change as the workflow unit or the durable memory store as source of truth.
- Interrupting, cancelling, or replaying a Run changes run state only; it does not accept a proposal, close a Change, or rewrite canonical ECL files by itself.
- Thread View must remain rebuildable from durable facts and must not become an independent source of truth.

## 12. Approval Boundary

The Approval Inbox is a project-level actionable view, not a new source of truth.

It may surface:

- spec proposals ready for accept;
- plan proposals ready for accept;
- audit proposals ready for accept;
- worktrees ready to apply;
- Changes ready to close;
- Harness evolution proposals awaiting approval.

Accepting an approval updates the underlying canonical object. The inbox itself must be rebuildable from canonical state.

Phase 5G presents this as a Decision Inbox. Pending decisions must show what the user is accepting, including proposal/run/worktree/artifact evidence. Accepted and completed decisions may stay visible as interaction history, but they do not become workflow truth. A request-changes decision records user feedback and suggests a follow-up proposal/run; it must not directly rewrite canonical files.

Accepted, consumed, applied, discarded, or closed items must leave the pending queue. De-duplication must be backed by canonical artifacts, accepted events, or action records that point back to canonical evidence.

## 13. Worktree vs Container Boundary

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

## 14. Codex-Style Executor Boundary

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

Write-mode Coder boundary:

- `aho run codex` remains read-only proposal capture.
- `aho code run` is the explicit write-mode entrypoint.
- Coder execution must use an AHO-owned worktree checkout as cwd.
- Source project root is read/context only during Coder execution.
- Coder prompt profiles are product assets and must encode ECL source-of-truth order, explore-first discipline, smallest coherent diff, and proposal-only status.
- A Coder run may produce a dirty worktree and diff artifacts, but it must not apply, merge, close, archive, or evolve Harness rules.
- If the source project root changes during a Coder run, the run is failed and preserved as evidence.

Apply/discard boundary:

- `aho worktree apply` is the explicit human adoption command for a validated and audited worktree diff.
- Apply is not merge, PR, push, or close.
- Apply requires matching `worktreeDiffHash` across the current worktree diff, validation evidence, audit evidence, and accepted review.
- Apply requires a clean source repo and unchanged source `HEAD`; AHO does not auto-merge, rebase, or resolve conflicts.
- `aho worktree apply --commit` is explicit commit confirmation. Without `--commit`, source changes remain uncommitted and block close until committed or cleaned.
- `aho worktree discard` only discards an unapplied worktree proposal. It does not revert source repo changes.

## 15. Validation and Auditor Boundary

Validation and audit are separate gates.

Validation answers whether commands and checks passed. Audit answers whether the change appears correct, aligned with the spec, and safe to apply.

Decisions:

- Validation results should be mechanical and artifact-backed.
- Validation is scoped to a Change and must not be treated as project-wide blanket approval.
- In early phases, no validation is warning-only while latest failed validation is blocking.
- In Phase 3C, no audit and failed audit are warning-only; only explicit `blocked` audit status blocks close.
- In Phase 3D, Coder self-reported verification is not authoritative validation.
- Auditor output is a proposal and cannot apply or merge by itself.
- A Coder run that passes validation can still be rejected by audit or human review.
- In Phase 3E, apply requires validation and audit evidence for the exact current worktree diff hash, not just the same change or worktree id.

Spec and Planner agents exist to prepare canonical ECL artifacts, not to bypass them.

- `aho change spec propose` is read-only and proposal-only.
- `aho change spec accept` is the human confirmation command that writes `spec.md`.
- `aho change plan propose` is read-only and proposal-only.
- `aho change plan accept` is the human confirmation command that writes `plan.md` and `tasks.md`, then rebuilds `ac-map.json`.
- Spec Agent must stay in WHAT/WHY; Planner must stay in HOW/tasks.
- Accept commands are stale-safe and must not overwrite user edits made after proposal generation.
- Accepting spec or plan does not run code, validation, audit, apply, close, or spec-test evidence acceptance.

Spec-Test mapping links Acceptance Criteria to test or validation evidence. It is evidence, not proof.

- `spec-tests.json` records explicit links from AC IDs to files, test names, validation commands, or notes.
- File existence and command validation status can be checked mechanically.
- Test names are human-auditable labels only in Phase 4A; AHO does not parse runner output.
- Phase 4B may ask Codex to propose existing evidence, but Codex must not directly edit `spec-tests.json`.
- AHO writes accepted evidence only after an explicit human confirmation command.
- In Phase 4B, only `source-root` `existingEvidence` can be accepted. Worktree-only evidence, suggested new tests, open questions, and unknown evidence stay proposal-only.
- Phase 4C may ask Codex to generate missing passing test evidence in an AHO-owned worktree, but the generator is test-only and proposal-only.
- Phase 4C generated tests do not become source-root evidence until validation, audit, human apply, and a later `spec-test propose` / `proposal accept` pass.
- Phase 4C rejects generator diffs that touch production code, package manifests, docs, Harness files, or `.agent-harness`.
- Phase 4C does not support accepted red tests; failing generated tests remain worktree proposals and must not be applied as evidence.
- Phase 4D drift diagnostics are deterministic risk signals. They do not call Codex, do not generate tests, and do not prove AC coverage.
- `stale` means the evidence may need refresh because validation or spec/task timestamps no longer line up; it is not proof that code and spec are inconsistent.
- `spec-test check --strict` can fail on invalid, stale, or failed accepted evidence, but missing evidence remains warning-only in Phase 4D.
- Missing linked evidence is warning-only. Broken linked evidence, such as a missing referenced file, is blocking.
- Later drift gates may become stricter only after the mapping and generation flows are stable.
- A failed validation should produce evidence for fixing code, improving specs, or evolving Harness rules.
- Spec-linked validation starts as warnings until the mapping model is mature enough to fail CI reliably.

## 16. Declarative Agent Spec Boundary

Future multi-agent scheduling must use declared roles, scoped Runs, artifacts, and approvals.

Decisions:

- Current bundled role profiles remain role contracts.
- Future Agent Specs should declare role id, description, allowed inputs, allowed outputs, write capability, preferred runtime, human confirmation requirements, and whether delegation is allowed.
- Role/subagent declarations may guide future schedulers, but they must not replace accepted specs, plans, tasks, or human gates.
- Multi-agent collaboration must not depend on a shared unbounded chat transcript.

## 17. Harness Evolution Boundary

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

## 18. Public Repo vs Local Harness Boundary

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

## 19. Deferred Boundaries

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

## 20. Current Defaults

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
