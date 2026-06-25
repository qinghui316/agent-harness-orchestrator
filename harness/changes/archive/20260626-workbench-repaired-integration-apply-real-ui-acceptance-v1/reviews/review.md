# Review: workbench-repaired-integration-apply-real-ui-acceptance-v1

Status: accepted / close-ready.

## Findings

No product defects found in this acceptance slice.

## Verification

- Selected verification scope: real browser UI acceptance for repaired
  IntegrationCheck apply, plus `npm run build`.
- Full / aggregate suites run or skipped: skipped `typecheck`, `lint`,
  `test:fast`, and `test:workbench` because no product code changed in this
  acceptance slice.
- Rationale for selected scope: the change only verifies that the already
  implemented `apply-check.apply` path can apply a Codex-backed
  `repaired.patch` through the real Workbench UI.
- Workbench URL: `http://127.0.0.1:4361`.
- External source: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- IntegrationCheck id: `apply-check-20260625165935-fa41891a`.
- Latest artifact hash:
  `af26694518e45610614cae93c86fe7be30b64445576f95a1438aaed69fc1cd45`.

## Complexity Deletion Review

- delete: no duplicate runtime, permission, projection, or evidence layer was
  added.
- reuse: reused existing Workbench UI, approval routing, current-gate
  revalidation, `applyIntegrationCheck`, source safety, and IntegrationCheck
  artifact records.
- yagni: avoided automatic integration apply/discard, new workflow runtime,
  new scheduler executor, child Change framework, and extra evidence family.
- shrink: no product code changed; the acceptance was completed with existing
  owners.
- net: Lean already.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Visible primary UI before apply: Workbench showed one human integration apply
  card with "确认应用到项目", "要求修改", "放弃", and "查看证据".
- Authority alignment: the visible card matched the authoritative
  `confirmationQueue.primary` integration apply gate.
- Future capability check: no `完全访问权限`, raw scheduler, merge, remote, PR,
  or Harness evolution automation was shown for integration apply/discard.
- Post-action surface: after manual apply, the snapshot primary changed to
  `planning-confirm`; the stale integration apply/discard card was no longer
  the current primary gate.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: `applyCheckId =
  apply-check-20260625165935-fa41891a`; `latestArtifactHash =
  af26694518e45610614cae93c86fe7be30b64445576f95a1438aaed69fc1cd45`.
- Tested action path: real browser click on `确认应用到项目`, followed by the
  scoped second confirmation `确认`.
- Duplicate action/evidence affordance: the flow required one explicit
  human apply card and one scoped second confirmation; no automation consumed
  the integration apply/discard gate.

## Source Apply Safety Coverage

- Applicable: yes.
- Checked source project: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Checked runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Pre-apply source state: clean, HEAD
  `f912eb83f50edfb3009cfa9ff8f33f11c62c639a`.
- Source-root mutation gate: source root changed only after the real browser
  human `apply-check.apply` confirmation.
- Post-apply source state:
  `M src/alpha.ts`, `M src/beta.ts`, `?? src/integration-note.ts`.
- Applied repaired result: `alphaMode` and `betaMode` changed to `"modern"`;
  `src/integration-note.ts` now exports `integrationReady = true`.
- IntegrationCheck status after apply: `applied`.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Checked boundary: Workbench served an external-local E-drive project with
  `AHO_HOME` pointing to the matching runtime home.
- Result: external-local memory restored the existing conversation and
  integration apply gate; no C-drive sandbox or AHO development repo was used
  as the managed source.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused or strengthened: IntegrationCheck artifact
  records, Workbench confirmation queue, approval action routing,
  current-gate revalidation, source safety, and `applyIntegrationCheck`.
- New cross-cutting mechanism and owner: none.
- Local framework / state machine / projection / validation / gate avoided:
  yes.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files to update: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Latest archive / active path alignment: update after close to the archive
  path for this change.
- Current baseline to record: Codex-backed IntegrationFix repaired artifacts
  have now been applied through a real browser human integration apply gate;
  integration apply/discard remains manual and outside scoped automation.

## Out-Of-Scope Confirmation

- Automatic integration apply/discard: not implemented.
- `完全访问权限` expansion: not implemented.
- Remote push/merge/PR: not implemented.
- Harness evolution auto-apply: not implemented.
- Cross-Change integration: not implemented.
