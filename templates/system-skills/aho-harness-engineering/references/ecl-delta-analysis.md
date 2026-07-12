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
