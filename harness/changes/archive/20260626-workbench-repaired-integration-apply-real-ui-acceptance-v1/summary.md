# workbench-repaired-integration-apply-real-ui-acceptance-v1

## Purpose

Verify that the repaired artifact produced by the latest Codex-backed
IntegrationFix can be applied safely through the real Workbench UI. The target
is the E-drive external sandbox from the prior acceptance run, where
IntegrationCheck `apply-check-20260625165935-fa41891a` is passed and waiting at
the human integration apply/discard gate.

This is an acceptance slice, not an automation expansion. Integration
apply/discard remains a human-gated transition outside scoped
`完全访问权限`.

## Scope

In scope:

- Prefer `E:\aho-accept\integrationfix-real-ui-v1\src` and
  `E:\aho-accept\integrationfix-real-ui-v1\home` when source, memory, and gate
  are still recoverable.
- Open Workbench in a real browser and confirm the visible
  `apply-check.apply` action.
- Record source status and Workbench primary-gate evidence before and after the
  apply.
- If a product blocker appears, fix only the existing integration-check,
  Workbench confirmation/read-model, approval routing, current-gate
  revalidation, or source/artifact safety owner needed to continue.

Out of scope:

- Automatic integration apply/discard.
- Expanding `完全访问权限`.
- New workflow runtime, scheduler executor, permission system, projection
  framework, child Change, or evidence family.
- Remote merge/push/PR, Harness evolution, cross-Change merge, or C-drive
  acceptance directories.

## Current Status

Completed / Ready to close.

## Verification

Real UI acceptance completed on the preferred E-drive sandbox; no product code
changes were needed.

- Workbench URL: `http://127.0.0.1:4361`.
- Source root: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- IntegrationCheck id: `apply-check-20260625165935-fa41891a`.
- Latest artifact ref:
  `workbench/integration-checks/apply-check-20260625165935-fa41891a/repaired.patch`.
- Latest artifact hash:
  `af26694518e45610614cae93c86fe7be30b64445576f95a1438aaed69fc1cd45`.
- Pre-apply source state: clean, HEAD
  `f912eb83f50edfb3009cfa9ff8f33f11c62c639a`.
- Visible primary gate before apply: human `integration-apply` card with
  "确认应用到项目", "要求修改", "放弃", and "查看证据"; no full-access automation
  option was shown for integration apply/discard.
- Real browser action: clicked "确认应用到项目", then the scoped second
  confirmation "确认" in the same integration apply card.
- Post-apply IntegrationCheck status: `applied`.
- Post-apply source state:
  `M src/alpha.ts`, `M src/beta.ts`, `?? src/integration-note.ts`.
- Applied repaired result:
  `alphaMode = "modern"`, `betaMode = "modern"`, and
  `src/integration-note.ts` exports `integrationReady = true`.
- Post-apply Workbench primary gate: `planning-confirm`; the old
  integration apply/discard gate was not still primary.

Selected verification:

- `npm run build`
- Real browser UI acceptance against the external sandbox.

Product checks such as `typecheck`, `lint`, `test:fast`, and
`test:workbench` were not rerun because this slice made no product-code
changes; the acceptance target was the already implemented repaired
integration apply path.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: DOM snapshot and API evidence recorded
  for `http://127.0.0.1:4361`; IntegrationCheck
  `apply-check-20260625165935-fa41891a`.
- External source/state safety: external source was clean before apply and
  changed only after the real browser human apply confirmation.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: update handoff docs to make
  repaired integration apply acceptance the latest product acceptance.
- Old experience retained / merged / retired / archive-only: not applicable.
