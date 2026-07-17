import { describe, expect, it } from "vitest";
import {
  beginWorkbenchOperation,
  invalidateWorkbenchOperation,
  releaseWorkbenchOperation,
  type WorkbenchOperationGateState,
} from "../../src/web/src/controllers/useGlobalOperationGate.js";

describe("global Workbench operation gate", () => {
  it("does not let an older finally release a newer operation", () => {
    const initial: WorkbenchOperationGateState = { active: null, generation: 0 };
    const first = beginWorkbenchOperation(initial, "conversation.send");
    const second = beginWorkbenchOperation(first.state, "interaction.answer");

    expect(releaseWorkbenchOperation(second.state, first.token)).toEqual(second.state);
    expect(releaseWorkbenchOperation(second.state, second.token).active).toBeNull();
  });

  it("invalidates an in-flight token when the selected scope changes", () => {
    const started = beginWorkbenchOperation({ active: null, generation: 3 }, "confirmation.apply");
    const invalidated = invalidateWorkbenchOperation(started.state);

    expect(invalidated.active).toBeNull();
    expect(invalidated.generation).toBeGreaterThan(started.token.id);
    expect(releaseWorkbenchOperation(invalidated, started.token)).toEqual(invalidated);
  });
});
