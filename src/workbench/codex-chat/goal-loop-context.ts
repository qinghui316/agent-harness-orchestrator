import { buildGoalLoopMainAgentContextSection } from "../../goal-loop/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";

export interface VisibleGoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  markdown: string;
}

export async function buildVisibleGoalLoopMainAgentContextSection(
  project: ManagedProject,
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
): Promise<VisibleGoalLoopMainAgentContextSection | null> {
  const section = await buildGoalLoopMainAgentContextSection(memory, changePath, changeId);
  if (!section) return null;
  const workpad = await getWorkbenchWorkpadProjection({ project, path: project.path }, changeId).catch(() => null);
  if (workpad?.goalLoop?.goalLoopNextStepPacketId !== section.goalLoopNextStepPacketId) return null;
  return section;
}
