# Spec: controlled-scheduler-next-candidate-prompt-evidence

## Goal

Expose the Workbench-visible controlled Scheduler next candidate to main-Agent prompt/prepared evidence so the next main-Agent turn can explain the same current candidate that the Workpad and right confirmation card already show.

## Users

- Users continuing a controlled Scheduler / Goal Loop demand conversation.
- Main-agent prompt/context builders that need compact, current, non-executing evidence about the next candidate.

## Acceptance Criteria

- AC-001: Main-agent chat/orchestrator context can carry a compact `controlledSchedulerNextCandidate` prompt evidence object sourced from the Workbench workpad read model.
- AC-002: The candidate is exposed only when `workpad.goalLoop.goalLoopNextStepPacketId` matches the visible Goal Loop context section packet id.
- AC-003: Prepared evidence includes status, label/body/action label, readiness flag, human-confirmation flag, evidence refs, and explicit false-authority/non-executing fields; it must not include action payloads, scope blobs, or markdown bodies.
- AC-004: `ready-for-confirmation` and `needs-review` candidates are both represented honestly; `needs-review` must not be worded as execution-ready.
- AC-005: No Workbench action, server route, workflow action, scheduler runtime, ToolPolicy, apply/close/merge, IntegrationCheck, or Harness evolution behavior changes.
- AC-006: Tests cover prompt/context evidence, packet parity suppression, and compact prepared evidence.

## Non-Goals

- No new UI button or confirmation item.
- No automatic loop continuation or scheduler dispatch.
- No parsing of transient `postStepHandoff` as source of truth.
- No product runtime or source mutation path.

## Constraints

- Keep the implementation in the Workbench chat adapter boundary:
  - `src/workbench/codex-chat/goal-loop-context.ts`
  - `src/workbench/codex-chat/context.ts`
  - `src/workbench/codex-chat/goal-loop-prompt-evidence.ts`
- Do not add Workbench projection imports or Workbench DTO logic to `src/goal-loop/main-agent-context.ts`.
- Reuse existing `WorkbenchControlledSchedulerNextCandidate` from the read-model owner.
- UI-visible behavior is not changed; no new DOM test is required unless the implementation touches rendering.

## Risks

- Prompt evidence could accidentally look like execution authority. Mitigation: include explicit false-authority fields and no action payload/scope data.
- Stale workpad candidate could leak into prompt context. Mitigation: require packet id parity and tests.
