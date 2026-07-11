# Runtime Contract

Runtime provides a read-only envelope with `mode`, `projectId`, `assignmentId`, `inputCheckpoint`, `policyVersion`, evidence refs, current document/stable-memory refs, `allowedTargets`, and required verification. Closeout/evolution assignments also provide a fixed source window hash.

Treat all identity, window, path, target, and policy fields as server facts. Do not replace or broaden them. Return the same assignment identity, checkpoint, policy version, and source window hash.

Runtime, not this Skill, owns task creation, claim/fencing, retries, review, apply, rollback, ledger, watermark, close, and evolution completion.
