import type { LandingReadinessPackage } from "../landing/types.js";

export function renderPrBody(landing: LandingReadinessPackage): string {
  return [
    "## Summary",
    "",
    landing.summary,
    "",
    "## Changed Files",
    "",
    ...(landing.changedFiles.length ? landing.changedFiles.map((file) => `- ${file}`) : ["- None"]),
    "",
    "## Validation / Audit Evidence",
    "",
    ...(landing.artifactRefs.length ? landing.artifactRefs.map((ref) => `- ${ref}`) : ["- None"]),
    "",
    "## Merge Reviewer",
    "",
    landing.review?.summary ?? "No merge-reviewer summary.",
    "",
    "## Boundary",
    "",
    "This is a Draft PR handoff created by AHO. It does not merge, land, or enable auto-merge.",
    "",
  ].join("\n");
}

export function prTitleForLanding(landing: LandingReadinessPackage): string {
  const change = landing.target.changeIds[0] ?? "aho-change";
  return `AHO: ${change}`;
}

export function buildBranchName(landing: LandingReadinessPackage): string {
  const change = slug(landing.target.changeIds[0] ?? "change");
  return `aho/${change}-${landing.id.replace(/^landing-/, "").slice(0, 16)}`;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "change";
}
