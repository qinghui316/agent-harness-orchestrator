# Spec: workbench-local-landing-ready-terminal-close-v1

## Goal

When a selected Change has a ready local landing package after integration
apply, Workbench should route the local-first terminal surface to local
`change.close/archive`, completed/no primary gate, or a clear local close
blocker. It must not make PR provider readiness the primary gate when PR/remote
are out of scope or unavailable.

## Users

- Local AHO users finishing a multi-worktree / IntegrationFix demand without
  GitHub PR or remote merge.
- Future local Goal Loop runtime, which needs a reliable local terminal gate.

## Acceptance Criteria

- AC-001: Ready landing package + selected Change + unavailable PR provider
  does not make `pr-draft:provider:*` the primary confirmation item.
- AC-002: If the selected Change has a ready close gate, `change.close` is the
  primary confirmation item after local landing is ready.
- AC-003: If local close is not ready, Workbench shows a clear local close
  blocker as primary instead of PR provider readiness.
- AC-004: Existing real PR/remote flows are preserved when a draft PR or remote
  readiness artifact already exists.
- AC-005: `decisionInspector.primary` and `confirmationQueue.primary` remain
  aligned for the selected local terminal gate.
- AC-006: No automatic PR, remote, merge, integration apply/discard, or Harness
  evolution behavior is added.

## Non-Goals

- Do not implement PR provider setup or GitHub flow.
- Do not automate integration apply/discard.
- Do not add a local terminal runtime or new evidence family.
- Do not change source apply, landing, or close authority rules.
- Do not use C-drive acceptance directories.

## Constraints

- Prefer existing owners: Workbench confirmation projection, landing
  confirmation item builders, close gate projection, and current action
  revalidation.
- Preserve existing action ids and payload shapes.
- Keep detailed acceptance ids in the archive, not in entry docs.
- Keep unrelated untracked `README.md` out of this change.

## Risks

- A ready landing package may have no ready close gate because the Change still
  has true ECL close blockers. In that case Workbench must say that plainly
  rather than pretending the Change is closeable.
- PR provider behavior should not regress for users who intentionally continue
  into a real PR flow.
