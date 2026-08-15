import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ProviderFileInput, ProviderImageInput } from "../provider-runtime/contracts.js";
import type { ProjectRuntimePaths } from "../project-runtime/paths.js";
import type { ManagedProject } from "../types/index.js";
import {
  resolveAttachmentAbsolutePath,
  resolveTopicAttachments,
  type TopicAttachment,
} from "./attachments.js";
import type { TurnAttachmentEvidence, TurnAttachmentResolution } from "./conversation-turn-contract.js";

export interface TurnAttachmentResolverOptions {
  resolveRuntimePaths: (projectId: string) => ProjectRuntimePaths;
}

export class TurnAttachmentResolver {
  constructor(private readonly options: TurnAttachmentResolverOptions) {}

  async resolveMetadata(project: ManagedProject, attachmentIds: readonly string[] = []): Promise<readonly TopicAttachment[]> {
    const paths = this.requirePaths(project);
    return resolveTopicAttachments(project, [...attachmentIds], { workbenchRoot: paths.workbenchRoot });
  }

  async resolve(project: ManagedProject, attachments: readonly TopicAttachment[]): Promise<TurnAttachmentResolution> {
    if (attachments.length === 0) return freezeResolution(emptyResolution());
    const paths = this.requirePaths(project);
    const normalized = [...new Map(attachments.map((attachment) => [attachment.id, attachment])).values()]
      .sort((left, right) => left.id.localeCompare(right.id));
    const imageInputs: ProviderImageInput[] = [];
    const fileInputs: ProviderFileInput[] = [];
    const evidence: TurnAttachmentEvidence[] = [];
    const runtimeReadRoots = new Set<string>();

    for (const attachment of normalized) {
      const verified = await verifyAttachment(paths.workbenchRoot, attachment);
      if (attachment.kind !== "image" && attachment.kind !== "text") {
        throw badRequest(`Unsupported attachment type: ${attachment.fileName}`);
      }
      runtimeReadRoots.add(dirname(verified.path));
      const runtimeMode = attachment.kind === "image" ? "provider-image-input" : "provider-file-reference";
      const item: TurnAttachmentEvidence = {
        id: attachment.id,
        fileName: attachment.fileName,
        mediaType: attachment.mediaType,
        size: attachment.size,
        contentHash: attachment.hash,
        kind: attachment.kind,
        runtimeMode,
      };
      evidence.push(item);
      if (attachment.kind === "image") {
        imageInputs.push({
          id: attachment.id,
          path: verified.path,
          mediaType: attachment.mediaType,
          fileName: attachment.fileName,
          size: attachment.size,
          contentHash: attachment.hash,
          source: "managed-attachment",
        });
      } else if (attachment.kind === "text") {
        fileInputs.push({
          id: attachment.id,
          name: attachment.fileName,
          path: verified.path,
          mediaType: attachment.mediaType,
          size: attachment.size,
          contentHash: attachment.hash,
          source: "managed-attachment",
        });
      }
    }
    const handoffHash = stableAttachmentHash(evidence);
    return freezeResolution({
      attachmentIds: evidence.map((item) => item.id),
      attachments: normalized,
      imageInputs,
      fileInputs,
      runtimeReadRoots: [...runtimeReadRoots].sort(),
      evidence,
      diagnostics: [],
      handoffHash,
    });
  }

  async revalidate(project: ManagedProject, resolution: TurnAttachmentResolution): Promise<void> {
    const current = await this.resolve(project, resolution.attachments);
    if (current.handoffHash !== resolution.handoffHash) {
      throw conflict("Managed attachment evidence changed after Turn admission.");
    }
  }

  private requirePaths(project: ManagedProject): ProjectRuntimePaths {
    const paths = this.options.resolveRuntimePaths(project.id);
    if (paths.projectId !== project.id) throw conflict("Attachment runtime paths do not match the selected project.");
    return paths;
  }
}

async function verifyAttachment(workbenchRoot: string, attachment: TopicAttachment): Promise<{ path: string }> {
  if (attachment.source !== "composer") throw badRequest("Only managed Composer attachments are supported.");
  if (attachment.kind !== "image" && attachment.kind !== "text") throw badRequest(`Unsupported attachment type: ${attachment.fileName}`);
  const path = resolveAttachmentAbsolutePath(workbenchRoot, attachment);
  const attachmentsRoot = await realpath(resolve(workbenchRoot, "attachments")).catch(() => null);
  const attachmentRoot = await realpath(dirname(path)).catch(() => null);
  const managedRoot = await realpath(resolve(workbenchRoot, "attachments", attachment.id)).catch(() => null);
  const canonicalPath = await realpath(path).catch(() => null);
  if (!attachmentsRoot || !attachmentRoot || !managedRoot || !canonicalPath
    || !isContainedPath(attachmentsRoot, managedRoot)
    || attachmentRoot !== managedRoot
    || !isContainedPath(managedRoot, canonicalPath)) {
    throw badRequest(`Attachment content escaped its managed directory: ${attachment.id}`);
  }
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) throw badRequest(`Attachment content was not found: ${attachment.id}`);
  if (file.size !== attachment.size) throw conflict(`Attachment size changed after upload: ${attachment.id}`);
  const contentHash = createHash("sha256").update(await readFile(path)).digest("hex");
  if (contentHash !== attachment.hash) throw conflict(`Attachment content changed after upload: ${attachment.id}`);
  return { path: canonicalPath };
}

function isContainedPath(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function stableAttachmentHash(evidence: readonly TurnAttachmentEvidence[]): string {
  return createHash("sha256").update(JSON.stringify({ version: 1, evidence })).digest("hex");
}

function emptyResolution(): TurnAttachmentResolution {
  return {
    attachmentIds: [],
    attachments: [],
    imageInputs: [],
    fileInputs: [],
    runtimeReadRoots: [],
    evidence: [],
    diagnostics: [],
    handoffHash: stableAttachmentHash([]),
  };
}

function freezeResolution(input: TurnAttachmentResolution): TurnAttachmentResolution {
  return Object.freeze({
    ...input,
    attachmentIds: Object.freeze([...input.attachmentIds]),
    attachments: Object.freeze([...input.attachments]),
    imageInputs: Object.freeze(input.imageInputs.map((item) => Object.freeze({ ...item }))),
    fileInputs: Object.freeze(input.fileInputs.map((item) => Object.freeze({ ...item }))),
    runtimeReadRoots: Object.freeze([...input.runtimeReadRoots]),
    evidence: Object.freeze(input.evidence.map((item) => Object.freeze({ ...item }))),
    diagnostics: Object.freeze(input.diagnostics.map((item) => Object.freeze({ ...item }))),
  });
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequest";
  return error;
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
