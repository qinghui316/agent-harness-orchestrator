---
name: aho-harness-onboarding
description: Use when a project needs Agent Harness Orchestrator onboarding, Harness readiness analysis, project context extraction, or main-agent delegation guidance. Use for first project setup, mature project preparation, external-local memory orientation, ECL/Harness gap proposals, or building a ProjectContextPack before planning work. Do not use for ordinary feature implementation after the project context is already fresh.
---

# AHO Harness Onboarding

Use this Skill to help the main Agent understand a target project and propose
the smallest safe Harness setup or refresh. The Skill produces context and
proposals. It does not mutate the source root, create Changes, start workers,
run schedulers, apply results, close changes, or update Harness evolution.

## Outputs

Produce these sections when the project needs onboarding or context refresh:

1. `ProjectContextPack`
   - project identity and audience;
   - source root and memory mode if known;
   - main entrypoints, owned directories, and verification commands;
   - current Harness/readiness state;
   - source-safety boundaries and likely risky areas;
   - suggested main-Agent delegation hints, including which work is safe for
     read-only analysis, sequential implementation, or later low-conflict
     worktree slices.
2. `Harness Onboarding Proposal`
   - detected gaps;
   - files or settings that may need deterministic preparation;
   - docs/scripts/ECL additions that should be proposed through a normal AHO
     Change before any write;
   - explicit non-goals.
3. `Onboarding Decision Summary`
   - whether the project is ready for ordinary demand planning;
   - what still requires user confirmation;
   - what evidence should be refreshed next time.

## Workflow

### 1. Detect Project State

Inspect only bounded project evidence first:

- `AGENTS.md`, `.agent-harness/project.json`, `docs/`, `harness/`, package
  manifests, README files, source entrypoints, tests, and CI files.
- For external-local projects, note that durable memory may live outside the
  source root and must be resolved by AHO. Do not invent paths.
- Do not scan secrets, dependency caches, build outputs, `.git`, `node_modules`,
  or large generated directories.

Classify the project:

| State | Criteria | Result |
| --- | --- | --- |
| Empty | no meaningful source or docs | propose minimal project/Harness starting point |
| Code only | source exists but no AHO map | build ProjectContextPack and propose onboarding delta |
| Partial Harness | some AHO files or marker exist | identify gaps and stale parts |
| Harness ready | AHO map and checks exist | produce compact context refresh only |

### 2. Extract Project Identity

Use source evidence, not only Harness files:

- what the project does;
- who uses it;
- core workflow or domain model;
- primary source directories;
- runtime and verification commands;
- constraints that affect agent work.

If the project is mature and the identity is unclear, stop with open questions.
Do not generate generic Harness text as if it described the project.

### 3. Decide Preparation Shape

Use this rule:

- deterministic project preparation may create registry, marker, memory root,
  and minimal workpad structure through AHO engineering code;
- project-specific docs, ECL rules, scripts, or architecture notes are proposal
  material until accepted through a normal Change;
- repo-local/team-shared Harness migration is a separate explicit design, not a
  default onboarding side effect.

For empty projects, propose the smallest useful context and ask for missing
product/stack decisions before writing business code.

For mature projects, propose a delta. Do not overwrite existing docs or assume
the existing project should match AHO templates exactly.

### 4. Build Main-Agent Delegation Hints

Explain how the main Agent should route later work:

- read-only analysis for uncertain product or architecture questions;
- sequential implementation for dependent or high-conflict changes;
- worktree slices only when source scopes are explicit, non-overlapping, and
  accepted;
- validation/audit before any apply;
- human gates for plan confirmation, integration checks, integration
  apply/discard, close/archive, remote, merge, PR, and Harness evolution.

Do not assign worker roles directly. AHO Role Catalog, TaskGraph, Scheduler,
confirmationQueue, validation, and audit gates decide actual execution.

### 5. Finish With Boundaries

End with a short boundary note:

- Skill output is runtime context and proposal evidence only.
- Change/ECL artifacts, accepted plans, validation/audit, apply/close, and
  Harness evolution remain workflow truth.
- Any source mutation requires the existing AHO gates.

## Failure Modes

| Trigger | Response |
| --- | --- |
| Project path is unavailable or unreadable | Stop and report the path/permission blocker. |
| AHO memory path is external and not visible | State that AHO must provide the memory root; do not guess. |
| Project identity cannot be inferred | Ask focused project questions before proposing docs. |
| Existing Harness files conflict | Report the conflict and propose a reconcile Change. |
| Scope would require source writes | Convert it into a Harness Onboarding Proposal and stop before mutation. |
| User asks for feature implementation | Produce context only, then hand back to normal AHO planning. |

## Do Not Do

- Do not write files, apply patches, create git commits, or run destructive
  commands from this Skill.
- Do not create SchedulerRun, worker tasks, worktrees, IntegrationCheck,
  result apply, close/archive, remote, merge, PR, or Harness evolution.
- Do not treat Workbench SQLite, Codex sessions, UI state, or Skill output as
  workflow truth.
- Do not copy autonomous Skill optimization mechanics into this onboarding flow.
- Do not add long historical ledgers to `AGENTS.md` or status docs.
- Do not turn a mature project's docs into generic AHO boilerplate.

## Quality Checklist

Before returning, verify:

- `ProjectContextPack` names evidence used and uncertainty left.
- The proposal distinguishes deterministic preparation from user-confirmed
  Change work.
- The output contains no hidden authorization or automatic execution claim.
- The recommended next step is a real AHO gate, user question, or read-only
  context refresh.
- The output is concise enough for the main Agent to use as scheduling input.
