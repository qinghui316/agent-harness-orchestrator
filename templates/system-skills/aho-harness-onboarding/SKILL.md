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

## Core Boundary

AHO deterministic project preparation may create registry, marker, memory root,
and minimal workpad state. This Skill must not replace that engineering flow
and must not directly write files. Project-specific docs, scripts, ECL rules,
or Harness updates are proposed through normal AHO Change, plan confirmation,
validation/audit, and human gates.

The Skill output is runtime context for the main Agent. AHO workflow truth
remains Change/ECL artifacts, accepted plans, validation/audit evidence,
worktree state, apply/close decisions, and Harness evolution records.
