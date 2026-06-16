import { buildGoalLoopMainAgentContextSection, stripGoalLoopControllerPolicyContext } from "../../goal-loop/manager.js";
import type { GoalLoopCloseGateHandoff } from "../../goal-loop/close-handoff.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";

export interface VisibleGoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId?: string;
  routingPosture: string;
  routingLabel: string;
  guidedGateActionType?: string;
  guidedGateScope?: Record<string, string | string[]>;
  closeGateHandoff?: GoalLoopCloseGateHandoff;
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
  let visibleSection = section;
  if (section.goalLoopControllerPolicyId && workpad.goalLoop.controllerPolicyId !== section.goalLoopControllerPolicyId) {
    visibleSection = stripGoalLoopControllerPolicyContext(section);
  }
  if (workpad.goalLoop.closeGateHandoff) {
    const closeGateHandoff = workpad.goalLoop.closeGateHandoff;
    return {
      ...visibleSection,
      closeGateHandoff,
      markdown: appendCloseGateHandoffContext(visibleSection.markdown, closeGateHandoff),
    };
  }
  return visibleSection;
}

function appendCloseGateHandoffContext(
  markdown: string,
  handoff: NonNullable<VisibleGoalLoopMainAgentContextSection["closeGateHandoff"]>,
): string {
  return [
    markdown.trimEnd(),
    "",
    "### Human Close Gate Handoff",
    `- Existing approval: ${handoff.closeApprovalId}`,
    `- Close action: ${handoff.closeActionId}`,
    "- Authority: explanatory Goal Loop evidence only; the Change close/archive transition still requires the existing human close gate.",
    `- Reason: ${handoff.reason}`,
  ].join("\n");
}
