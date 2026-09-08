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

  it("keeps presentation projection-only and out of application and domain owners", () => {
    const presentation = read("src/web/src/presentation/conversation-experience.ts");
    expect(presentation).not.toMatch(/controllers|\.\.\/\.\.\/workbench|provider-runtime|\.\.\/api/);
    expect(presentation).not.toMatch(/fetch\(|postJson|fetchJson|useState|useEffect/);
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
    for (const path of ["src/desktop/main.ts", "src/desktop/utility.ts"]) {
      expect(read(path), path).not.toMatch(/ConversationDraftController|ConversationTurnSubmissionController|conversation-experience/);
    }
  });
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function importSources(source: string): string {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).join("\n");
}
