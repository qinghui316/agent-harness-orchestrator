# ecl-harness-engineer Skill Recommendations

This document records repository-backed recommendations for improving the user-local `ecl-harness-engineer` skill. It is advice only; this repository change does not edit `C:\Users\qinghui\.codex\skills\ecl-harness-engineer\SKILL.md`.

## Problem To Fix

The current Harness workflow is good at preserving experience, but it can drift into append-only behavior:

- `AGENTS.md` can become a phase ledger instead of an entry map.
- `docs/STATUS.md` can become an archive database instead of a short handoff.
- Roadmap/product-loop docs such as `docs/AGENT-DEVELOPMENT-OS.md` can keep stale `Current Baseline` or `Next Direction` language after the actual current plan has moved elsewhere.
- auto-evolve can conclude `noop` because existing rules cover the new risk while missing the separate question of whether current docs are accumulating stale or duplicate experience.

The skill should make documentation entropy and experience retirement first-class review concerns.

Codex memory/compaction is a useful reference principle, not something to copy wholesale into this Harness. The relevant lesson is: raw evidence stays durable, while current memory is derived, compact, provenance-backed, and allowed to forget stale inputs. Do not add a state database, background memory worker, UI, or two-phase memory pipeline to this project unless the user separately asks for product-level AHO self-evolution.

## Recommended Skill Changes

### 1. Strengthen "AGENTS.md Is A Map, Not A Manual"

Add explicit anti-patterns:

- Do not put the full completed-phase list in `AGENTS.md`.
- Do not turn `docs/STATUS.md` into the archive ledger.
- Do not copy the full closeout narrative into multiple current documents.
- Do not treat historical facts as current constraints unless they still change agent behavior.
- Do not leave stale `Current Baseline` or `Next Direction` text in roadmap docs after a newer current-plan document supersedes it.

Recommended replacement rule:

`AGENTS.md` should route to current state, source docs, and archive indexes. It should not preserve all phase history.

### 2. Add Doc Entropy Delta To Delta Synthesis

During Phase 3 delta synthesis, compute:

- line counts for `AGENTS.md`, `docs/STATUS.md`, and `docs/ECL.md`;
- duplicate current-state fields such as active change, pending evolution, latest product archive, latest Harness evolution, and current phase;
- archive-link density in `AGENTS.md` and `docs/STATUS.md`;
- stale current-state language in roadmap/current-plan docs, especially `docs/AGENT-DEVELOPMENT-OS.md` and `docs/CURRENT-DEVELOPMENT-PLAN.md`;
- whether historical entries should be retained, merged, retired, or archive-only.

Recommended output shape:

```markdown
## Documentation Entropy Delta

- AGENTS.md: {before} lines, target 80-120 for new harnesses or 120-180 for mature harnesses.
- STATUS.md: {before} lines, short-handoff fit: pass/fail.
- Duplicate current facts: {none/list}.
- Archive ledger leakage: {none/list}.
- Roadmap stale current-state language: {none/list}.
- Recommended action: compress / retain with rationale / no change.
```

### 3. Add Experience Retention Scan To Auto-Evolve

Every auto-evolve proposal should include:

- `Promote`: new evidence that should become rule/template/lint/test/command.
- `Retain`: old experience that still represents a current risk.
- `Merge`: repeated old rules that can become one shorter general rule.
- `Retire`: old experience now covered by code, lint, tests, templates, or later rules.
- `Archive-only`: historical facts that should stay in archived summaries, not current docs.

This scan should cover `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, `docs/AGENT-DEVELOPMENT-OS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and any changed Harness templates. It should be required even when the final recommendation is `noop`.

Recommended Codex-inspired boundary:

- Raw archive summaries and generated indexes are durable evidence.
- Current docs and templates are the compact derived memory layer.
- Current docs should keep only guidance that changes future agent behavior.
- Stale or unsupported current guidance should be retired or downgraded to archive-only instead of being smoothed into another current rule.
- Do not implement Codex memories Phase 1 / Phase 2 mechanics in the Harness skill; use the principle only.

### 4. Extend Verification

Add verification checks:

```powershell
(Get-Content -LiteralPath AGENTS.md -Encoding UTF8).Count
(Get-Content -LiteralPath docs/STATUS.md -Encoding UTF8).Count
rg "harness/changes/active/" AGENTS.md docs/STATUS.md
rg "Latest Harness evolution|Pending Harness evolution|Current active phase|Active ECL change" AGENTS.md docs/STATUS.md
rg "Current Baseline|Next Direction|Implemented baseline through Phase" docs/AGENT-DEVELOPMENT-OS.md docs/CURRENT-DEVELOPMENT-PLAN.md
```

For mature harnesses, `AGENTS.md` can target 120-180 lines instead of a strict 80-120 line budget, but over-budget content must have a current-behavior rationale.

### 5. Extend Review Templates

Generated review templates should include:

- `Documentation Entropy Coverage`
- `Experience Lifecycle Coverage`

These sections should be applicable to docs, handoff, Harness rule/template, and auto-evolve changes.

The documentation entropy section should ask whether roadmap/current-plan documents contain stale current-state language. The experience lifecycle section should ask what old experience was retained, merged, retired, or downgraded to archive-only.

### 6. Add Blacklist Entries

Add these anti-patterns to the skill blacklist:

- Repeatedly adding rules from old experience without retiring old rules.
- Writing historical facts into `AGENTS.md` as current constraints.
- Marking evolution as `noop` because rules are sufficient while ignoring documentation bloat.
- Leaving an old `Next Direction` in a roadmap document as if it were current after the active plan moved elsewhere.
- Proposing a heavyweight memory/state/background pipeline when the user's request is only to optimize Harness docs and the skill's guidance.
- Treating line count as the only metric instead of asking whether content still changes current agent behavior.

## Suggested Test Prompts For Skill Evaluation

Use these prompts when evaluating the updated skill:

1. "Audit this mature Harness repo whose AGENTS.md is 400 lines and STATUS.md is 500 lines. Should we compress it?"
   - Expected: The skill identifies doc entropy, proposes compression, and protects archive summaries as historical truth.

2. "Handle this pending auto-evolve window where existing rules are enough, but AGENTS.md keeps growing after every close."
   - Expected: The skill does not stop at `noop`; it runs an Experience Retention Scan and proposes merge/retire/archive-only actions.

3. "This mature Harness has a roadmap doc that still says Phase 7 is the Next Direction, but STATUS and CURRENT-DEVELOPMENT-PLAN are post-Phase-10. Should auto-evolve fix it?"
   - Expected: The skill recommends historicalizing or replacing stale current-direction language while preserving historical roadmap evidence.

4. "Create a new core harness for a TypeScript repo."
   - Expected: The skill creates a compact `AGENTS.md`, short `STATUS.md`, and review templates with entropy/lifecycle fields without overloading the new project with full internal process history.

## Acceptance Standard For The Skill Update

The updated skill should cause future Harness work to:

- keep entry documents compact by default;
- record when a document exceeds budget and why;
- classify old experience during self-evolution;
- preserve history in archives rather than current entry docs;
- recommend `noop` only after checking both new-rule gaps and stale-experience cleanup;
- scan roadmap/current-plan docs for stale current-state language;
- keep Codex memory/compaction as a design principle unless product-level self-evolution is explicitly requested.
