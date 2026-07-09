import { describe, expect, it } from "vitest";
import { artifactForActionResult, labelForAction, summarizeActionResult } from "../../src/workbench/actions/results.js";

describe("Workbench action result summaries", () => {
  it("summarizes PR feedback rework from resolved output and links its canonical artifact", () => {
    const result = {
      result: {
        resultArtifact: "artifacts/pr-feedback-result.json",
        resolvedOutput: { summary: "Feedback rework passed validation and audit." },
      },
    };
    expect(summarizeActionResult("pr-feedback.rework", result)).toBe("Feedback rework passed validation and audit.");
    expect(artifactForActionResult(result)).toBe("artifacts/pr-feedback-result.json");
  });

  it("keeps concrete Scheduler action labels user-facing", () => {
    expect(labelForAction("planning.scheduler.worker.start-next")).toBe("Scheduler next coder worker started");
    expect(summarizeActionResult("planning.scheduler.worker.start-next", {})).not.toContain("planning.scheduler.worker.start-next");
  });
});
