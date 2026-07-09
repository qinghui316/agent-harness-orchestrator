import type { ResolvedMemory } from "../types/index.js";
import {
  buildMaintenanceArtifactRefListForStores,
  type MaintenanceArtifactRefListItem,
} from "./maintenance-artifact-store.js";

type CanonicalPatchApplicationArtifactTarget = Omit<MaintenanceArtifactRefListItem, "includeMarkdown">;

export function buildCanonicalPatchApplicationManifestArtifactRefs(
  memory: ResolvedMemory,
  input: {
    gateRecord: CanonicalPatchApplicationArtifactTarget;
    patchProposal: CanonicalPatchApplicationArtifactTarget;
    upstreamRefs: string[];
  },
): string[] {
  return buildMaintenanceArtifactRefListForStores(memory, [
    input.gateRecord,
    input.patchProposal,
  ], input.upstreamRefs);
}

export function buildCanonicalPatchApplicationResultArtifactRefs(
  memory: ResolvedMemory,
  input: {
    result: CanonicalPatchApplicationArtifactTarget;
    manifest: CanonicalPatchApplicationArtifactTarget;
    upstreamRefs: string[];
    policyAuditRefs: string[];
  },
): string[] {
  return buildMaintenanceArtifactRefListForStores(memory, [
    input.result,
    input.manifest,
  ], [
    ...input.upstreamRefs,
    ...input.policyAuditRefs,
  ]);
}

export function buildCanonicalPatchApplicationReportArtifactRefs(
  memory: ResolvedMemory,
  input: {
    report: CanonicalPatchApplicationArtifactTarget;
    result: CanonicalPatchApplicationArtifactTarget;
    manifest: CanonicalPatchApplicationArtifactTarget;
    upstreamRefs: string[];
    policyAuditRefs: string[];
  },
): string[] {
  return buildMaintenanceArtifactRefListForStores(memory, [
    input.report,
    input.result,
    { ...input.manifest, includeMarkdown: false },
  ], [
    ...input.upstreamRefs,
    ...input.policyAuditRefs,
  ]);
}
