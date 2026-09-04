import { describe, expect, it } from "vitest";
import { buildComposerActionProjection } from "../../src/web/src/shell/composer.js";

describe("Composer action projection", () => {
  it("uses send only when idle and no queue item is ahead", () => {
    expect(buildComposerActionProjection({ running: false, hasDraft: true, canQueue: true })).toMatchObject({ primaryIntent: "send", canSubmitDraft: true });
    expect(buildComposerActionProjection({ running: false, hasDraft: true, canQueue: true, queueHasItems: true })).toMatchObject({ primaryIntent: "queue", canSubmitDraft: true });
  });

  it("projects Stop, Steer, and Queue from the current execution state", () => {
    expect(buildComposerActionProjection({ running: true, hasDraft: false, canStop: true })).toMatchObject({ primaryIntent: "stop", canStop: true });
    expect(buildComposerActionProjection({ running: true, hasDraft: true, canStop: true, canSteer: true, canQueue: true })).toMatchObject({ primaryIntent: "steer", alternativeIntent: "queue" });
    expect(buildComposerActionProjection({ running: true, hasDraft: true, hasNextTurnContext: true, canStop: true, canSteer: true, canQueue: true })).toMatchObject({ primaryIntent: "queue" });
  });

  it("never exposes a submit action while state is being reconciled", () => {
    expect(buildComposerActionProjection({ running: false, hasDraft: true, queueBusy: true })).toMatchObject({ primaryIntent: "wait", canSubmitDraft: false });
    expect(buildComposerActionProjection({ running: false, hasDraft: true, queueReady: false })).toMatchObject({ primaryIntent: "wait", canSubmitDraft: false });
    expect(buildComposerActionProjection({ running: true, hasDraft: true, stopping: true, canStop: true })).toMatchObject({ primaryIntent: "wait", canSubmitDraft: false, canStop: false });
  });
});
