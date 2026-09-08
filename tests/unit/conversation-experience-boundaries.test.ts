import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Conversation experience boundaries", () => {
  it("keeps application contracts independent of presentation", () => {
    for (const path of [
      "src/web/src/controllers/ConversationDraftController.ts",
      "src/web/src/controllers/ConversationTurnSubmissionController.ts",
      "src/web/src/controllers/conversation-submission-contract.ts",
      "src/web/src/controllers/useConversationComposerController.ts",
    ]) {
      expect(read(path), path).not.toMatch(/from\s+["'][^"']*presentation\/conversation-experience/);
    }
  });

  it("keeps the experience projection pure and out of domain owners", () => {
    const projection = read("src/web/src/controllers/ComposerExperienceProjection.ts");
    expect(projection).not.toMatch(/\.\.\/\.\.\/workbench|provider-runtime|\.\.\/api/);
    expect(projection).not.toMatch(/fetch\(|postJson|fetchJson|useState|useEffect/);
  });

  it("keeps Draft ownership away from transport, Timeline, Provider, and persistence", () => {
    const draft = read("src/web/src/controllers/ConversationDraftController.ts");
    expect(importSources(draft)).not.toMatch(/\.\.\/api|canonicalTimeline|provider-runtime|ComposerDraftSyncOwner/);
    expect(draft).not.toMatch(/fetch\(|postJson/);
  });

  it("keeps Queue and Review behind the neutral dispatch port", () => {
    const queue = read("src/workbench/conversation-turn-queue.ts");
    const review = read("src/workbench/conversation-review-lifecycle.ts");
    expect(queue).not.toContain('from "./conversation-review-lifecycle.js"');
    expect(review).not.toContain('from "./conversation-turn-queue.js"');
    expect(queue).toContain('from "./conversation-queued-review-dispatch.js"');
    expect(review).toContain("implements ConversationQueuedReviewDispatchPort");
  });

  it("keeps App and Electron hosts out of Conversation implementation owners", () => {
    const app = read("src/web/src/App.tsx");
    expect(app).not.toMatch(/ConversationDraftController|ConversationTurnSubmissionController/);
    expect(app).not.toMatch(/projectComposerModelLabel/);
    for (const path of ["src/desktop/main.ts", "src/desktop/utility.ts"]) {
      expect(read(path), path).not.toMatch(/ConversationDraftController|ConversationTurnSubmissionController|ComposerExperienceProjection/);
    }
  });

  it("keeps submission lifecycle transport and optimistic mutations in the submission owner", () => {
    const hook = read("src/web/src/controllers/useConversationComposerController.ts");
    const owner = read("src/web/src/controllers/ConversationTurnSubmissionController.ts");
    const composition = read("src/web/src/controllers/ConversationSubmissionComposition.ts");
    expect(hook).not.toMatch(/consumeWorkbenchLiveStream/);
    expect(hook).not.toMatch(/await\s+portsRef\.current\.session\.createConversation/);
    expect(hook).not.toMatch(/portsRef\.current\.timeline\.(showPending|markPending)\?\.\(/);
    expect(owner).not.toMatch(/from\s+["']react["']|useState|useEffect|useMemo/);
    expect(owner).not.toMatch(/consumeWorkbenchLiveStream|WorkbenchRequestError|userFacingErrorMessage/);
    expect(composition).toMatch(/consumeWorkbenchLiveStream/);
    expect(owner).toMatch(/\.session\.createConversation\(/);
    expect(owner).toMatch(/\.timeline\.showPending\?\./);
  });
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function importSources(source: string): string {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).join("\n");
}
