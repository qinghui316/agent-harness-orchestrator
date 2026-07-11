# Failure And Recovery

Stop before editing when assignment identity, checkpoint, policy version, fixed source window, evidence scope, workspace root, writable Markdown namespaces, or required verification is missing or inconsistent.

Do not resolve staleness by reading a wider window, escaping the workspace, or broadening writable namespaces. Return `blocked`; Runtime decides retry or reassignment.

If an edit fails midway, inspect the workspace and either restore internal document consistency within the assignment or report the incomplete state precisely. Do not apply it elsewhere. Reviewer rejection, verification failure, diff capture, rollback, retry limits, and dead-letter handling are Runtime responsibilities.
