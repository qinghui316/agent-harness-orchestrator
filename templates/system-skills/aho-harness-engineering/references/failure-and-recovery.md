# Failure And Recovery

Stop before editing when assignment identity, checkpoint, policy version, fixed source window, evidence scope, canonical root, writable Markdown namespaces, or required verification is missing or inconsistent.

Do not resolve staleness by reading a wider window, escaping canonical namespaces, or broadening writable namespaces. Return `blocked`; Runtime decides retry or reassignment.

If an edit fails midway, inspect the canonical targets and either restore internal document consistency within the assignment or report the incomplete state precisely. Verification failure, retry limits, lease interruption, and dead-letter handling are Runtime responsibilities.
