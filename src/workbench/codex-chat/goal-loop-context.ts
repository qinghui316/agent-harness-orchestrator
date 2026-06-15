import { buildGoalLoopMainAgentContextSection, stripGoalLoopControllerPolicyContext } from "../../goal-loop/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";

export interface VisibleGoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId?: string;
  guidedGateActionType?: string;
  guidedGateScope?: Record<string, string | string[]>;
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
  if (section.goalLoopControllerPolicyId && workpad.goalLoop.controllerPolicyId !== section.goalLoopControllerPolicyId) {
    return stripGoalLoopControllerPolicyContext(section);
  }
  return section;
}
