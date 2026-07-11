# Failure And Recovery

Stop before proposing a patch when assignment identity, checkpoint, policy version, source window, evidence, target allowlist, or before hash is missing or inconsistent.

Do not resolve staleness by rereading a wider window or changing targets. Return `blocked`; Runtime decides retry or reassignment.

Reviewer rejection, verification failure, atomic apply, rollback, retry limits, and dead-letter handling are Runtime responsibilities. Do not encode commands or lifecycle instructions in the package.
