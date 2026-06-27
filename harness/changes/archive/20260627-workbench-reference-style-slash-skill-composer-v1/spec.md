# Spec: workbench-reference-style-slash-skill-composer-v1

## Goal

Implement reference-style Skill selection in the Workbench composer. Users can
type `/skill-name` to choose a real scanned Skill for the current demand or
conversation. `$skill-name` remains a compatibility alias. Selected Skills
become Codex runtime capabilities through the existing AHO Skill enablement and
Codex bridge path.

## Users

- Local Harness-mode users who want to steer Codex with a known Skill from the
  composer rather than opening Settings first.
- Future provider work that needs a provider-neutral Skill catalog while Codex
  remains the only active runtime target.

## Acceptance Criteria

- AC-001: `/` in the Workbench composer opens a Skill autocomplete backed by
  real project Skills; `$` opens the same Skill list without other commands.
- AC-002: Selecting a Skill inserts a visible token/chip and records the Skill
  for the draft demand or selected topic.
- AC-003: Before send, `/skill-name` and `$skill-name` tokens that match real
  Skills are removed from the demand body and become Skill enablement; unmatched
  tokens stay in the body.
- AC-004: Draft selected Skills migrate to topic-level enablement after topic
  creation; existing-topic selections update topic-level enablement.
- AC-005: Codex run context continues to use `getEnabledSkillContext`, recording
  enabled Skill ids and hashes without executing Skill scripts.
- AC-006: UI does not expose fake marketplace, model/provider dropdown,
  attachment, file reference, or unrelated slash command controls.

## Non-Goals

- Full slash command system.
- File references, attachments, marketplace, model settings, or provider
  switching.
- Direct execution of Skill scripts by AHO.
- Changes to confirmation queues, Goal Loop, Scheduler, validation/audit,
  apply/close, remote, merge, PR, or Harness evolution permissions.

## Constraints

- Reference behavior must be checked against `desktop-cc-gui` composer source:
  inline selection extraction, autocomplete triggers, and prompt assembly.
- Skills are runtime capabilities, not Harness workflow truth.
- Reuse existing `setSkillEnabled`, `getEnabledSkillContext`, and Codex bridge
  owners; do not add a second Skill storage or permission system.

## Risks

- Showing slash controls without complete behavior would repeat a previous fake
  control issue. Only Skill-backed controls may be visible in this change.
- Unsynced Skills could confuse users if presented as ready. The picker must
  show Codex sync state truthfully.

