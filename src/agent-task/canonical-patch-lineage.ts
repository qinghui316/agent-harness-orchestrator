import type {
  MaintenanceCanonicalPatchAppliedOperation,
  MaintenanceCanonicalPatchApplicationGateRecord,
  MaintenanceCanonicalPatchApplicationManifest,
  MaintenanceCanonicalPatchApplicationManifestOperation,
  MaintenanceCanonicalPatchApplicationReportOperation,
  MaintenanceCanonicalPatchApplicationResult,
  MaintenanceCanonicalPatchOperation,
  MaintenanceCanonicalPatchProposal,
} from "../types/index.js";

export function buildCanonicalPatchDerivedOperationId(parentId: string, index: number): string {
  return `${parentId}-operation-${String(index + 1).padStart(3, "0")}`;
}

export function copyCanonicalPatchProposalOperationLineage(
  operation: MaintenanceCanonicalPatchOperation,
): Pick<MaintenanceCanonicalPatchApplicationManifestOperation, "patchOperationId" | "targetKind" | "operation" | "sourceResolutionId" | "sourceCandidateId" | "summary" | "rationale" | "artifactRefs"> {
  return {
    patchOperationId: operation.id,
    targetKind: operation.targetKind,
    operation: operation.operation,
    sourceResolutionId: operation.sourceResolutionId,
    sourceCandidateId: operation.sourceCandidateId,
    summary: operation.summary,
    rationale: operation.rationale,
    artifactRefs: operation.artifactRefs,
  };
}

export function copyCanonicalPatchManifestOperationLineage(
  operation: MaintenanceCanonicalPatchApplicationManifestOperation,
): Pick<MaintenanceCanonicalPatchAppliedOperation, "manifestOperationId" | "patchOperationId" | "targetKind" | "operation" | "artifactRefs"> {
  return {
    manifestOperationId: operation.id,
    patchOperationId: operation.patchOperationId,
    targetKind: operation.targetKind,
    operation: operation.operation,
    artifactRefs: operation.artifactRefs,
  };
}

export function copyCanonicalPatchAppliedOperationLineage(
  operation: MaintenanceCanonicalPatchAppliedOperation,
): Pick<MaintenanceCanonicalPatchApplicationReportOperation, "resultOperationId" | "manifestOperationId" | "patchOperationId" | "targetKind" | "operation" | "targetPath" | "patchKind" | "beforeHash" | "afterHash" | "artifactRefs"> {
  return {
    resultOperationId: operation.id,
    manifestOperationId: operation.manifestOperationId,
    patchOperationId: operation.patchOperationId,
    targetKind: operation.targetKind,
    operation: operation.operation,
    targetPath: operation.targetPath,
    patchKind: operation.patchKind,
    beforeHash: operation.beforeHash,
    afterHash: operation.afterHash,
    artifactRefs: operation.artifactRefs,
  };
}

export function validateCanonicalPatchApplicationGateLineage(
  gateRecord: MaintenanceCanonicalPatchApplicationGateRecord,
  patchProposal: MaintenanceCanonicalPatchProposal,
): void {
  if (gateRecord.patchProposalId !== patchProposal.id) {
    throw new Error(`Maintenance canonical patch application gate lineage mismatch: gate ${gateRecord.id} points to ${gateRecord.patchProposalId}, loaded ${patchProposal.id}`);
  }
  if (gateRecord.proposalId !== patchProposal.proposalId) {
    throw new Error(`Maintenance canonical patch application gate proposal lineage mismatch: gate ${gateRecord.id}`);
  }
  if (gateRecord.decisionId !== patchProposal.decisionId) {
    throw new Error(`Maintenance canonical patch application gate decision lineage mismatch: gate ${gateRecord.id}`);
  }
  if (gateRecord.operationCount !== patchProposal.operationCount || gateRecord.operationCount !== patchProposal.operations.length) {
    throw new Error(`Maintenance canonical patch application gate operation count mismatch: gate ${gateRecord.id}`);
  }
}

export function validateCanonicalPatchApplicationManifestLineage(
  manifest: MaintenanceCanonicalPatchApplicationManifest,
  gateRecord: MaintenanceCanonicalPatchApplicationGateRecord,
  patchProposal: MaintenanceCanonicalPatchProposal,
): void {
  if (manifest.gateRecordId !== gateRecord.id) {
    throw new Error(`Maintenance canonical patch application manifest gate lineage mismatch: manifest ${manifest.id}`);
  }
  if (manifest.patchProposalId !== patchProposal.id || gateRecord.patchProposalId !== patchProposal.id) {
    throw new Error(`Maintenance canonical patch application manifest patch proposal lineage mismatch: manifest ${manifest.id}`);
  }
  if (manifest.proposalId !== patchProposal.proposalId || manifest.proposalId !== gateRecord.proposalId) {
    throw new Error(`Maintenance canonical patch application manifest proposal lineage mismatch: manifest ${manifest.id}`);
  }
  if (manifest.decisionId !== patchProposal.decisionId || manifest.decisionId !== gateRecord.decisionId) {
    throw new Error(`Maintenance canonical patch application manifest decision lineage mismatch: manifest ${manifest.id}`);
  }
  if (
    manifest.operationCount !== manifest.operations.length
    || manifest.operationCount !== patchProposal.operationCount
    || manifest.operationCount !== patchProposal.operations.length
    || manifest.operationCount !== gateRecord.operationCount
  ) {
    throw new Error(`Maintenance canonical patch application manifest operation count mismatch: manifest ${manifest.id}`);
  }
}

export function validateCanonicalPatchApplicationManifestOperationLineage(
  manifestOperation: MaintenanceCanonicalPatchApplicationManifestOperation,
  proposalOperation: MaintenanceCanonicalPatchOperation,
): void {
  if (
    manifestOperation.targetKind !== proposalOperation.targetKind
    || manifestOperation.operation !== proposalOperation.operation
    || manifestOperation.sourceResolutionId !== proposalOperation.sourceResolutionId
    || manifestOperation.sourceCandidateId !== proposalOperation.sourceCandidateId
  ) {
    throw new Error(`Canonical patch application operation lineage mismatch: ${manifestOperation.id}`);
  }
}

export function validateCanonicalPatchApplicationResultLineage(
  result: MaintenanceCanonicalPatchApplicationResult,
  manifest: MaintenanceCanonicalPatchApplicationManifest,
): void {
  if (result.manifestId !== manifest.id) {
    throw new Error(`Maintenance canonical patch application report lineage mismatch: result ${result.id} points to manifest ${result.manifestId}, loaded ${manifest.id}`);
  }
  if (
    result.patchProposalId !== manifest.patchProposalId
    || result.gateRecordId !== manifest.gateRecordId
    || result.proposalId !== manifest.proposalId
    || result.decisionId !== manifest.decisionId
  ) {
    throw new Error(`Maintenance canonical patch application report lineage mismatch: result ${result.id}`);
  }
  if (
    result.operationCount !== result.appliedOperations.length
    || result.operationCount !== manifest.operationCount
    || result.operationCount !== manifest.operations.length
  ) {
    throw new Error(`Maintenance canonical patch application report operation count mismatch: result ${result.id}`);
  }

  const manifestOperations = new Map(manifest.operations.map((operation) => [operation.id, operation]));
  for (const operation of result.appliedOperations) {
    const manifestOperation = manifestOperations.get(operation.manifestOperationId);
    if (!manifestOperation) {
      throw new Error(`Maintenance canonical patch application report missing manifest operation for result operation: ${operation.id}`);
    }
    validateCanonicalPatchApplicationResultOperationLineage(operation, manifestOperation);
  }
}

function validateCanonicalPatchApplicationResultOperationLineage(
  resultOperation: MaintenanceCanonicalPatchAppliedOperation,
  manifestOperation: MaintenanceCanonicalPatchApplicationManifestOperation,
): void {
  if (
    resultOperation.patchOperationId !== manifestOperation.patchOperationId
    || resultOperation.targetKind !== manifestOperation.targetKind
    || resultOperation.operation !== manifestOperation.operation
  ) {
    throw new Error(`Maintenance canonical patch application report operation lineage mismatch: ${resultOperation.id}`);
  }
}
