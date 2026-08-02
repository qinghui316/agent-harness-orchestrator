import type { WorkbenchWorkpad } from "../../read-model-types.js";

export function shellWorkbenchWorkpad(workpad: WorkbenchWorkpad): WorkbenchWorkpad {
  return {
    ...workpad,
    intake: { ...workpad.intake, pendingClarifications: [] },
  };
}
