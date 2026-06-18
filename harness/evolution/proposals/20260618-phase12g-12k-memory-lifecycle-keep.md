# Phase 12G-12K Harness Evolution Proposal

## Candidate Window

- `harness/changes/archive/20260618-phase-12g-controlled-loop-state-main-agent-context/summary.md`
- `harness/changes/archive/20260618-phase-12h-controlled-loop-runtime-prompt-evidence/summary.md`
- `harness/changes/archive/20260618-phase-12i-status-handoff-entropy-cleanup/summary.md`
- `harness/changes/archive/20260618-phase-12j-goal-loop-routing-posture-runtime-evidence/summary.md`
- `harness/changes/archive/20260618-phase-12k-product-memory-lifecycle-target/summary.md`

## Scan

Phase 12G, 12H, and 12J repeatedly reinforced existing Goal Loop, Runtime Bridge, Proposal/Runtime, ToolPolicy/human-gate, stale-suppression, and compact prompt-evidence boundaries. These do not require a new Harness rule, template, or lint check.

Phase 12I validated the existing Documentation Entropy and Experience Lifecycle rules by compressing `docs/STATUS.md` back into a short resume point and leaving detailed history archive-only.

Phase 12K promoted that lesson into the product-level AHO maintenance model. During implementation, a concrete repository durability gap surfaced: `docs/PRODUCT.md` and `docs/MEMORY.md` are product source documents that Phase 12K intentionally updates, but they were ignored/untracked by the current `.gitignore` pattern. Without a targeted tracking correction, the product memory lifecycle target would remain local state rather than durable project memory.

## Recommendation

Status: `keep`

Apply a small documentation-source tracking correction:

- Add `.gitignore` exceptions for `docs/PRODUCT.md` and `docs/MEMORY.md`.
- Include those files in the tracked change set.
- Do not add new Harness rules, templates, lint checks, or runtime behavior.

## Experience Retention Scan

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| Goal Loop controlled-loop and routing prompt evidence must remain compact, stale-suppressed, and non-executing | Retain | Existing Goal Loop and Runtime Bridge rules already cover this. |
| Detailed phase chronology should not return to `docs/STATUS.md` | Retain | Phase 12I validated current Documentation Entropy rules. |
| Product maintenance should treat current memory/docs as compact derived memory | Promote | Phase 12K product docs now record this as a product target. |
| Exact Phase 12G-12K field names, UI placement, and prompt labels | Archive-only | They are implementation details, not reusable Harness rules. |
| Product source docs updated by a phase should not remain ignored/untracked | Promote as repository correction | This is a concrete durability fix for current source docs, not a generic new Harness rule. |

## Boundaries

- No product runtime behavior changes.
- No Scheduler loop/full executor, worker auto-start, ToolPolicy bypass, source mutation, apply/merge/close automation, or Harness evolution auto-apply behavior.
- Canonical docs and stable memory remain human-gated; this proposal only makes existing product source docs durable in Git.
