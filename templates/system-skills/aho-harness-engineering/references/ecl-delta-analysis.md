# ECL Delta Analysis

Compare assigned evidence with current project truth:

1. State the durable fact the evidence proves.
2. Find the current artifact responsible for that fact.
3. Classify the result as Create, Update, or Already Good.
4. Prefer the smallest coherent delta that improves the next Agent's decisions.
5. Verify that the delta did not copy incident chronology into current guidance.

Create means no current owner exists and a durable owner is needed. Update means
an owner is stale, incomplete, duplicated, or misplaced. Already Good means
current artifacts already express the fact at the right level.

User requests and Agent summaries are hypotheses until supported by accepted
Change, validation, audit, apply, close, or current-source evidence. Conflicting
evidence is a reason to investigate or block, not to silently choose a narrative.

For onboarding, write the delta in four groups before editing:

- **Core readiness**: missing or stale owners required by the Runtime's existing
  AHO Harness audit contract.
- **Project guidance**: current project-specific entry, state, architecture,
  commands, or knowledge documents that change the next Agent's decisions.
- **Optional capability**: evaluation, tracing, metrics, long-term memory, or
  other advanced infrastructure only when the user explicitly requests it.
- **Already Good / Archive-only**: content that needs no change or belongs in
  historical evidence rather than current guidance.

Core readiness is mandatory in AHO Harness mode, but it is not a file write
allowlist. The Agent decides the content and project-specific additions after
reading the real roots and evidence. A small business task may still remain a
direct Main Agent task; onboarding does not itself require a Change or Planning
child.
