# Spec: workbench-conversation-delete-harness-resume-entry-v1

## Problem

Workbench currently only allows removing archived/completed conversations from the sidebar. During the current test-stage product flow, users need to delete noisy or obsolete conversation records at any time. That must not delete Harness workflow truth or make an active Change unreachable.

## Acceptance Criteria

- AC-001: Active and archived Workbench conversations can be deleted from the sidebar.
- AC-002: Deleting a conversation removes Workbench conversation/message/transcript visibility, but does not delete, move, close, abandon, archive, or mutate the underlying Harness Change or workflow evidence.
- AC-003: The sidebar no longer shows the archived-only disabled text `处理完成后才能移出侧栏`.
- AC-004: Deleted active Changes remain discoverable from a project-level active-work resume entry.
- AC-005: Resume from a deleted conversation uses Harness status/replay/recovery/ResumePoint/current gate evidence, not deleted transcript messages.
- AC-006: UI wording does not expose close / abandon / cancel / Change lifecycle options as part of conversation deletion.
- AC-007: Existing confirmationQueue, current gate, ToolPolicyGate, action registry, automation allowlist, Scheduler, IntegrationCheck, apply/close, and source safety behavior remain unchanged.

## Non-Goals

- Do not implement destructive Change deletion.
- Do not add Change abandon/cancel.
- Do not change close gate semantics.
- Do not make transcript history workflow truth.
