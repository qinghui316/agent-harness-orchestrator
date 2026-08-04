import { shortHash, slugify } from "../../src/fs/path.js";
import {
  createProjectHarnessChange,
  listProjectHarnessChanges,
} from "../../src/project-harness/change.js";
import {
  projectHarnessConversationLane,
  resolveProjectHarnessRegistryContext,
} from "../../src/project-harness/registry.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import type { ManagedProject } from "../../src/types/index.js";
import { appendCanonicalTimelineEntry } from "../../src/workbench/canonical-timeline-command.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";

export async function createConversationChangeFixture(
  project: ManagedProject,
  input: { title: string; body?: string },
): Promise<{ changeId: string; conversationId: string; title: string; state: "active" }> {
  const body = input.body?.trim() || input.title;
  const runtime = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (runtime.state !== "ready") {
    throw new Error(`Conversation fixture requires a ready project Harness: ${runtime.state}.`);
  }
  const changeId = await allocateProjectHarnessChangeId(runtime.resolution.harness.skillRoot, input.title);
  const conversationId = `conv-${changeId}`;
  const graphScopeId = `graph:${conversationId}`;
  const registry = await resolveProjectHarnessRegistryContext({
    projectId: runtime.resolution.harness.projectId,
    projectRoot: runtime.resolution.projectRoot,
    skillRoot: runtime.resolution.harness.skillRoot,
  });
  await createProjectHarnessChange({
    ...registry,
    lane: projectHarnessConversationLane(conversationId, graphScopeId),
  }, { changeId, scope: body });

  const now = new Date().toISOString();
  const store = await openProjectRuntimeWorkbenchDatabase(runtime.resolution.paths);
  try {
    store.conversations.createConversation({
      projectId: runtime.resolution.harness.projectId,
      conversationId,
      title: input.title,
      state: "active",
      boundChangeId: changeId,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    store.unitOfWork.startConversationGraphScope(
      runtime.resolution.harness.projectId,
      conversationId,
      graphScopeId,
      now,
    );
    store.unitOfWork.acceptConversationChangeBinding(
      runtime.resolution.harness.projectId,
      conversationId,
      changeId,
      now,
      `fixture-acceptance:${changeId}`,
      `fixture-proposal:${changeId}`,
    );
  } finally {
    store.close();
  }
  await appendCanonicalTimelineEntry(project, changeId, { type: "user.message", text: body });
  return { changeId, conversationId, title: input.title, state: "active" };
}

async function allocateProjectHarnessChangeId(skillRoot: string, title: string): Promise<string> {
  const rawSlug = slugify(title);
  const base = rawSlug === "project" ? `project-${shortHash(title)}` : rawSlug;
  const occupied = new Set((await listProjectHarnessChanges(skillRoot)).map((change) => change.change_id));
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
