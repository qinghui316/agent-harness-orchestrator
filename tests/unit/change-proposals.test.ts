import { describe, expect, it } from "vitest";
import { parsePlanProposalMessage, parseSpecProposalMessage } from "../../src/change/proposals.js";

describe("change proposal parsing", () => {
  it("parses proposed spec proposal JSON", () => {
    const parsed = parseSpecProposalMessage([
      "```json",
      JSON.stringify({
        status: "proposed",
        specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Works",
        openQuestions: [],
        assumptions: ["Low-risk assumption"],
        warnings: [],
      }),
      "```",
    ].join("\n"));

    expect(parsed.status).toBe("proposed");
    expect(parsed.specMd).toContain("AC-001");
    expect(parsed.assumptions).toEqual(["Low-risk assumption"]);
  });

  it("parses blocked status line as blocked proposal", () => {
    const parsed = parseSpecProposalMessage("Status: blocked\n");

    expect(parsed.status).toBe("blocked");
    expect(parsed.warnings[0]).toContain("No JSON payload");
  });

  it("marks invalid spec JSON as failed", () => {
    const parsed = parseSpecProposalMessage("```json\n{\"status\":\"unknown\"}\n```");

    expect(parsed.status).toBe("failed");
    expect(parsed.warnings[0]).toContain("Spec proposal JSON was invalid");
  });

  it("parses proposed plan proposal JSON", () => {
    const parsed = parsePlanProposalMessage([
      "```json",
      JSON.stringify({
        status: "proposed",
        planMd: "# Plan\n\nUse current patterns.",
        tasksMd: "# Tasks\n\n- [ ] T-001: Do it\n  - Covers: AC-001",
        openQuestions: [],
        assumptions: [],
        warnings: [],
      }),
      "```",
    ].join("\n"));

    expect(parsed.status).toBe("proposed");
    expect(parsed.planMd).toContain("current patterns");
    expect(parsed.tasksMd).toContain("T-001");
  });

  it("marks missing plan JSON as failed", () => {
    const parsed = parsePlanProposalMessage("No useful output");

    expect(parsed.status).toBe("failed");
    expect(parsed.warnings[0]).toContain("did not include parseable JSON");
  });
});
