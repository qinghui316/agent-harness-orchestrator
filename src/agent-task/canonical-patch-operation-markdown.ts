import type {
  MaintenanceCanonicalPatchAppliedOperation,
  MaintenanceCanonicalPatchApplicationManifestOperation,
  MaintenanceCanonicalPatchApplicationReportOperation,
  MaintenanceCanonicalPatchOperation,
} from "../types/index.js";
import { formatCanonicalPatchTargetDescriptor } from "./canonical-patch-target-boundary.js";
import { renderMaintenanceMarkdownDetailItem } from "./maintenance-markdown.js";

export function renderCanonicalPatchProposalOperationMarkdownDetails(
  operation: MaintenanceCanonicalPatchOperation,
): string[] {
  return renderMaintenanceMarkdownDetailItem(
    `${operation.id}: ${operation.operation} ${operation.targetKind}`,
    [
      `resolution: ${operation.sourceResolutionId}`,
      `candidate: ${operation.sourceCandidateId}`,
      `targetDescriptor: ${formatCanonicalPatchTargetDescriptor(operation.targetDescriptor)}`,
      `summary: ${operation.summary}`,
      `rationale: ${operation.rationale.replace(/\r?\n/g, " ")}`,
    ],
  );
}

export function renderCanonicalPatchManifestOperationMarkdownDetails(
  operation: MaintenanceCanonicalPatchApplicationManifestOperation,
): string[] {
  return renderMaintenanceMarkdownDetailItem(
    `${operation.id}: ${operation.readiness}`,
    [
      `patchOperation: ${operation.patchOperationId}`,
      `targetKind: ${operation.targetKind}`,
      `operation: ${operation.operation}`,
      `targetDescriptor: ${formatCanonicalPatchTargetDescriptor(operation.targetDescriptor)}`,
      `blockedReasons: ${operation.blockedReasons.length > 0 ? operation.blockedReasons.join("; ") : "none"}`,
    ],
  );
}

export function renderCanonicalPatchAppliedOperationMarkdownDetails(
  operation: MaintenanceCanonicalPatchAppliedOperation,
): string[] {
  return renderMaintenanceMarkdownDetailItem(
    `${operation.id}: ${operation.status}`,
    [
      `manifestOperation: ${operation.manifestOperationId}`,
      `patchOperation: ${operation.patchOperationId}`,
      `targetKind: ${operation.targetKind}`,
      `targetPath: ${operation.targetPath}`,
      `patchKind: ${operation.patchKind}`,
      `beforeHash: ${operation.beforeHash}`,
      `afterHash: ${operation.afterHash}`,
    ],
  );
}

export function renderCanonicalPatchObservedOperationMarkdownDetails(
  operation: MaintenanceCanonicalPatchApplicationReportOperation,
): string[] {
  return renderMaintenanceMarkdownDetailItem(
    `${operation.id}: ${operation.status}`,
    [
      `resultOperation: ${operation.resultOperationId}`,
      `manifestOperation: ${operation.manifestOperationId}`,
      `patchOperation: ${operation.patchOperationId}`,
      `targetKind: ${operation.targetKind}`,
      `targetPath: ${operation.targetPath}`,
      `patchKind: ${operation.patchKind}`,
      `beforeHash: ${operation.beforeHash}`,
      `afterHash: ${operation.afterHash}`,
    ],
  );
}
