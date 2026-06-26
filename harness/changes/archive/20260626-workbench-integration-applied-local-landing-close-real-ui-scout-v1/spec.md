# Spec: workbench-integration-applied-local-landing-close-real-ui-scout-v1

## Goal

Through a real browser Workbench session, verify that a repaired
IntegrationFix result can continue after human `apply-check.apply` into local
`landing.prepare` and local `change.close/archive`, or stop with a clearly
classified blocker.

## Users

- Local AHO users who rely on the Workbench to finish a multi-worktree /
  IntegrationFix demand without PR or remote collaboration.
- Future local Goal Loop implementation, which needs a proven local terminal
  path before broader observe/decide/act looping.

## Acceptance Criteria

- AC-001: Workbench opens an E-drive external-local sandbox and shows the
  current selected demand/gate from AHO memory.
- AC-002: The visible path reaches or restores a repaired IntegrationFix
  `apply-check.apply` gate, or a fresh sandbox recreates it.
- AC-003: Human confirmation of `apply-check.apply` mutates only the external
  source root, records before/after source status, and removes the stale
  integration apply/discard primary gate.
- AC-004: The next visible primary gate is local `landing.prepare`,
  scheduler outcome/completion evidence needed to reach it, local
  `change.close`, completed/no primary gate, or an explicit blocker.
- AC-005: Local `landing.prepare` records landing package/review evidence and
  does not create PR, remote, merge, push, or provider-side effects.
- AC-006: If local `change.close` is presented, human confirmation archives or
  completes the Change; final UI does not continue to show stale primary gates.
- AC-007: Any failure is classified as product path bug, source safety
  blocker, environment/provider blocker, Codex/agent-quality issue, or
  validation/audit/landing blocker.

## Non-Goals

- Do not implement PR, remote landing, merge, push, or GitHub setup.
- Do not automate integration apply/discard.
- Do not implement full local Goal Loop runtime.
- Do not add a new workflow engine, permission system, projection framework,
  scheduler executor, child Change mechanism, or evidence family.
- Do not use C-drive acceptance directories.

## Constraints

- Use E-drive external sandbox paths only.
- Keep AHO development checkout separate from managed source and runtime home.
- Preserve `README.md` as unrelated untracked unless the user says otherwise.
- If product code must change, fix the existing owner path only:
  integration-check, scheduler outcome, landing, close, Workbench read-model,
  action routing, or current-gate revalidation.

## Risks

- The preferred sandbox may already be post-apply or otherwise unrecoverable;
  in that case create a fresh E-drive sandbox and record why.
- Remote/PR affordances may appear because landing evidence is provider-ready;
  if that happens, this change must verify local boundary wording and must not
  execute remote actions.
- A blocker may be real product behavior rather than acceptance environment
  drift; if so, repair only the smallest existing owner needed to continue.
