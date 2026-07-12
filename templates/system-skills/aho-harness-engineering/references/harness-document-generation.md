# Harness Document Generation

Use this reference when editing AHO Harness Markdown. Script or linter gaps are
reported to Runtime and are never edited by this Skill.

## Document Roles

| File or Area | Role |
| --- | --- |
| `AGENTS.md` | Compact map and context-loading order |
| `docs/ECL.md` | Change lifecycle, active/parking/archive rules, evolution constraints |
| `docs/STATUS.md` | Short current handoff, not archive history |
| `docs/ARCHITECTURE.md` | Architecture layers and decisions |
| `docs/BOUNDARIES.md` | Ownership and authority boundaries |
| `docs/DEVELOPMENT.md` | Local commands and verification |
| `docs/PRODUCT.md` | Product goals and MVP boundaries when product context exists |
| `harness/changes/` | Structured change state |
| `harness/evolution/` | Pending/results/state for periodic Harness evolution |
| `scripts/` | Mechanical lint, reindex, evolve, encoding, and project checks |

## What Can Be Migrated From ecl-harness-engineer

Directly adapt:

- project state and ECL readiness detection;
- Small vs Structured change distinction;
- context loading order;
- documentation entropy rules;
- baseline verification snapshot;
- evidence-backed experience lifecycle classification and documentation entropy checks.

Rewrite for AHO:

- AGENTS/ECL/STATUS templates;
- change/review templates;
- script and linter wording;
- empty project onboarding;
- repo-local vs external-local paths.

Do not copy:

- Darwin optimizer content;
- README marketing assets;
- direct commit/apply/close instructions;
- old subagent prompts as AHO execution logic;
- greenfield business code scaffolds as default output.

## Edit Quality

Each final summary should state:

- changed Markdown path inside the assigned canonical namespace;
- why it is needed;
- evidence supporting it;
- whether it is deterministic preparation or project-specific content;
- assigned verification and its result. Runtime owns task fencing, lease interruption, fixed windows, and Evolution scoring.

## Document Quality Gates

Carry forward the useful quality constraints from `ecl-harness-engineer` in
AHO terms:

- `AGENTS.md` is a compact map, not a phase ledger or archive ledger.
- `docs/STATUS.md` is a short handoff, not a historical database.
- Technical claims should point to bounded source evidence when available.
- Generated docs should separate current facts, assumptions, open decisions,
  and historical/archive references.
- Existing project-specific docs take precedence over generic templates; merge
  evidence-backed content instead of replacing user-written guidance wholesale.
- Verification guidance should map to the detected project command surface and
  should not weaken existing business gates.

## Documentation Entropy

Keep maps compact. Put history in archives. Merge duplicate current facts
instead of adding new permanent sections.
