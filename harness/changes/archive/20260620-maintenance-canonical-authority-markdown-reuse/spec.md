# Spec: Maintenance Canonical Authority Markdown Reuse

## Goal

Reduce repeated `## Authority` markdown rendering in the maintenance canonical update / canonical patch chain by reusing the existing canonical authority owner.

The change preserves behavior while making future canonical maintenance artifact renderers cheaper and less error-prone to add.

## Users

- Future AHO agents adding or reviewing maintenance canonical artifacts.
- Maintainers checking authority wording and boundary claims.
- Workbench users indirectly, because visible maintenance evidence should keep the same meaning.

## Acceptance Criteria

- AC-001: `src/agent-task/canonical-patch-application-authority.ts` owns reusable authority markdown rendering helpers for the existing canonical maintenance authority profiles.
- AC-002: Canonical update proposal/decision, canonical patch proposal/application gate, application manifest/result, and application report markdown renderers reuse the authority helper instead of local `## Authority` blocks.
- AC-003: Existing markdown authority text and artifact behavior remain compatible; schema, ids, object fields, authority flag values, lineage, target validation, artifact refs, ledger events, gates, Workbench actions, source mutation, scheduler, Goal Loop, and runtime behavior do not change.
- AC-004: Targeted authority/markdown and module-boundary tests, typecheck, lint, Harness checks, and close-ready review pass.

## Non-Goals

- Do not introduce new artifacts, reports, manifests, descriptors, projections, gates, ledger policies, or runtime protocols.
- Do not move domain markdown sections other than the shared authority block.
- Do not change public manager exports, Workbench server/frontend behavior, or source mutation semantics.
- Do not run full `npm run test` unless targeted verification reveals broader risk.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The helper must only render authority markdown lines and must not own artifact write, ledger, gate, runtime, Workbench action, or source mutation logic.
- Feature/domain modules keep domain-specific source/status/operation/evidence sections.
- Architecture Growth Control applies: consolidate repeated authority rendering into an existing owner without creating a new local framework.

## Risks

- A helper that becomes too generic could turn into another mini-rendering framework.
- Accidentally changing authority wording could weaken boundary evidence or break tests that assert artifact text.
- Pulling unrelated markdown into the helper could blur domain ownership.
