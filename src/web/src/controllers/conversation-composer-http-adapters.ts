import { fetchJson, postJson } from "../api.js";
import type { SkillListItem, TopicAttachment } from "../types.js";
import type { ComposerAttachmentUpload } from "./conversation-submission-contract.js";
import { skillRequestSearchParams, type SkillRequestIdentity } from "./conversation-composer-contract.js";

export const defaultComposerSkillApi = {
  async load(identity: SkillRequestIdentity): Promise<SkillListItem[]> {
    const params = skillRequestSearchParams(identity);
    const payload = await fetchJson<{ skills?: SkillListItem[] }>(
      `/api/projects/${encodeURIComponent(identity.projectId)}/skills?${params.toString()}`,
    );
    return Array.isArray(payload.skills) ? payload.skills : [];
  },
  async setEnabled(identity: SkillRequestIdentity, skillId: string, enabled: boolean): Promise<void> {
    await postJson(`/api/projects/${encodeURIComponent(identity.projectId)}/skills/${encodeURIComponent(skillId)}/enable`, {
      enabled,
      productMode: identity.productMode,
      conversationId: identity.conversationId ?? undefined,
      providerId: identity.providerId ?? undefined,
    });
  },
};

export const defaultComposerAttachmentApi = {
  async upload(projectId: string, upload: ComposerAttachmentUpload): Promise<TopicAttachment> {
    return (await postJson<{ attachment: TopicAttachment }>(
      `/api/projects/${encodeURIComponent(projectId)}/attachments`,
      upload,
    )).attachment;
  },
  async remove(projectId: string, attachmentId: string): Promise<void> {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error(await response.text());
  },
};

export function readComposerFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Attachment reader did not return a data URL."));
    reader.readAsDataURL(file);
  });
}
