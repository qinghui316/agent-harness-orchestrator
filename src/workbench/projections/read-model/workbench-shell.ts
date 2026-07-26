import type { WorkbenchWorkpad } from "../../read-model-types.js";

export function shellWorkbenchWorkpad(workpad: WorkbenchWorkpad): WorkbenchWorkpad {
  return {
    ...workpad,
    maintenance: undefined,
    intake: { ...workpad.intake, pendingClarifications: [] },
  };
}
