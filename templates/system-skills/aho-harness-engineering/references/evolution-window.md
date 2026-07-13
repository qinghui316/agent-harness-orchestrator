# Evolution Window

Analyze exactly the Runtime-assigned window together with the current Harness.
The fifth Change's ordinary handoff maintenance is part of this pass.

Before editing, write a proposal with accepted and rejected lessons, evidence,
project relevance, intended delta, lifecycle decisions, verification, and risk.
When the Runtime task explicitly asks for the proposal only, stop after the
proposal. Do not spawn a scorer or pre-empt the separate scoring continuation.

When Runtime continues the proposal thread with the scoring request, spawn one
independent read-only scorer child with the complete fixed window, proposal,
hard-issue criteria, and weights:

- Evidence grounding: 30
- Project relevance: 25
- Mechanical enforceability: 15
- Regression safety: 20
- Context cost: 10

Do not edit before a score of at least 80 with no hard issue. On a lower score,
revise the proposal once. If the second score is still insufficient, stop with
no-op or blocked evidence. After acceptance, re-read current files, directly
complete the proposal, and verify. Prefer consolidation and deletion over
append-only rules; an accepted no-op is valid.
