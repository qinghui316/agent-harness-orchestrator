---
name: aho-harness-onboarding
description: Use when AHO needs first project onboarding, Harness readiness analysis, no-docs project context extraction, mature-project Harness preparation, or main-agent delegation guidance. Use during first-demand onboarding, explicit /aho-harness-onboarding requests, or stale project context refresh; do not use for ordinary feature work when context is already fresh.
---

# AHO Harness Onboarding

This Skill helps the main Agent understand a target project and propose the
smallest safe AHO Harness setup or refresh. It is proposal and context
guidance only.

## Use When

- A project has just been added to AHO and the first user demand is entering
  planning.
- The user explicitly selects `/aho-harness-onboarding`.
- The project has code but little or no project documentation.
- A mature project needs a Harness readiness review before normal AHO work.
- The main Agent needs a compact context pack before deciding whether work is
  sequential, read-only, or later eligible for low-conflict worker slices.

## Workflow

1. Confirm this is onboarding, context refresh, or explicit
   `/aho-harness-onboarding` usage. If it is ordinary feature work with fresh
   context, stop using this Skill.
2. Select only the references needed for the current project state. Do not load
   every reference just because it exists.
3. Classify the project as Empty, Code Only, Partial Harness, or Harness Ready
   using bounded evidence and AHO resolved memory paths.
4. Produce the required output: `ProjectContextPack`, `Harness Onboarding
   Proposal`, and `Onboarding Decision Summary`, or compact mode when the
   project is already ready.
5. Hand control back to normal AHO planning. The next real action must be an
   AHO gate, not a Skill-authorized mutation.

## Main-Agent Handoff Routing

When the main Agent receives an explicit plan handoff such as "execute this
plan", "执行当前计划", or a Workbench Plan handoff card intent, treat it as user
intent only. First read project guidance in this order when present:
`AGENTS.md`, `docs/ECL.md`, active change files, `harness/evolution/pending.md`
only when no active change exists, `docs/STATUS.md`, then task-specific docs.
Use this Skill only if the project context is missing, stale, or explicitly
needs onboarding. The Skill can provide context and delegation hints; it cannot
create a Change, start workers, approve full access, or execute the plan.

## Do Not Use When

- The project context is fresh and the user is asking for ordinary feature
  implementation.
- A worker agent is executing a bounded task.
- The goal is to run scheduler workers, IntegrationCheck, apply, close, remote,
  merge, PR, or Harness evolution.

## Required Reading

Read only the references needed for the situation:

- `references/first-demand-onboarding-flow.md` for first-demand sequencing.
- `references/project-state-detection.md` for Empty / Code Only / Partial
  Harness / Harness Ready classification.
- `references/aho-memory-layout.md` for repo-local and external-local paths.
- `references/no-docs-document-authoring.md` when the project lacks useful
  docs.
- `references/harness-document-generation.md` when proposing AGENTS/ECL/STATUS
  or related docs.
- `references/main-agent-orchestration-guide.md` when producing delegation
  hints.
- `references/output-templates.md` for required output shapes.

## STOP / CHECKPOINT

STOP if source or AHO memory paths are unreadable, if evidence would require
secrets or generated/dependency caches, or if the user asks for source writes
before plan confirmation. Return a blocker or open decision instead.

CHECKPOINT before proposing any document/schema/script write: name the target
file, evidence, verification, and human gate. The Skill can propose that work;
it cannot perform it.

## Core Boundary

AHO deterministic project preparation may create registry, marker, memory root,
and minimal workpad state. This Skill must not replace that engineering flow
and must not directly write files. Project-specific docs, scripts, ECL rules,
or Harness updates are proposed through normal AHO Change, plan confirmation,
validation/audit, and human gates.

The Skill output is runtime context for the main Agent. AHO workflow truth
remains Change/ECL artifacts, accepted plans, validation/audit evidence,
worktree state, apply/close decisions, and Harness evolution records.
