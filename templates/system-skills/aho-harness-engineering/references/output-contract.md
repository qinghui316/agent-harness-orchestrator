# Output Contract

For maintenance/evolution modes return one declarative `PatchPackage`:

```json
{
  "mode": "maintain-assigned-closeout",
  "assignmentId": "assigned-id",
  "inputCheckpoint": "checkpoint-hash",
  "policyVersion": "policy-v1",
  "sourceWindowHash": "window-hash",
  "summary": "Evidence-backed result",
  "observations": [{"text":"...","evidenceRefs":["..."]}],
  "decisions": [{"kind":"retain","subject":"...","reason":"...","evidenceRefs":["..."]}],
  "patches": [{"targetId":"allowed-target-id","beforeHash":"...","afterHash":"...","reason":"...","evidenceRefs":["..."],"operations":[{"kind":"hunk","oldText":"old","newText":"new"}]}],
  "context": null,
  "verificationRequests": ["assigned-verification-id"],
  "warnings": [],
  "status": "ready"
}
```

`kind` is one of `promote`, `retain`, `merge`, `retire`, or `archive-only`. Use target IDs from the envelope, never filesystem paths. Return `status: "noop"` with no patches when no durable delta is justified, or `status: "blocked"` with warnings for unresolved conflicts.

For onboarding/audit modes, use the same envelope and set `context` to `{ "projectState": "...", "uncertainty": [], "recommendations": [] }`. Unknown keys, filesystem paths, commands, lifecycle actions, and operation kinds other than `replacement` or `hunk` are invalid.
