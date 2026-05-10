# Reference Map: ecl-harness-engineer

Source repo: `https://github.com/qinghui316/ecl-harness-engineer`

Local submodule path: `reference-projects/ecl-harness-engineer/`

Inspected files: `SKILL.md`, ECL/Harness references.

## Summary

ecl-harness-engineer defines the Core Harness model: project-first `AGENTS.md`, ECL change lifecycle, Harness scripts, status handoff, and controlled auto-evolution from archived evidence.

## Borrow

- `AGENTS.md` as map, not manual.
- Small Change versus Structured Change.
- `summary.md`, `spec.md`, `plan.md`, `tasks.md`, and `reviews/review.md`.
- `docs/STATUS.md` handoff.
- `harness/evolution/pending.md`, proposal, audit, validation, `results.tsv`, and mark-complete.

## Do Not Copy

- Do not make the external skill a runtime dependency for the product.
- Do not let scripts auto-apply semantic Harness changes.
- Do not turn one-off business mistakes into permanent rules without evidence.

## Product Implications

The product should bundle its own Harness templates and generators based on this baseline, then evolve them through archived evidence.

## Open Questions

- Which parts of the skill should become product templates first?
- Which ECL checks should stay PowerShell and which should move to TypeScript in Phase 1?
