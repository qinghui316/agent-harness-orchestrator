export function selectLandingSummaryArtifactRef(artifactRefs: readonly string[]): string | undefined {
  return artifactRefs[1] ?? artifactRefs[0];
}

export function selectLandingReviewArtifactRef(
  artifactRefs: readonly string[],
  options?: { fallback?: "package" | "summary" },
): string | undefined {
  return artifactRefs.find((ref) => ref.endsWith("merge-review.md"))
    ?? (options?.fallback === "package" ? artifactRefs[0] : selectLandingSummaryArtifactRef(artifactRefs));
}
