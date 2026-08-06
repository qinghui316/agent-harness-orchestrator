import { describe, expect, it } from "vitest";
import { buildAcMap, parseAcceptanceCriteria, parseReviewStatus, parseTasks } from "../../src/ecl/anchors.js";

describe("change parsing", () => {
  it("parses and normalizes AC IDs", () => {
    const parsed = parseAcceptanceCriteria("- ac-001: First\n- AC-002: Second\n- AC-001: Duplicate");

    expect(parsed.criteria.map((item) => item.id)).toEqual(["AC-001", "AC-002", "AC-001"]);
    expect(parsed.duplicateIds).toEqual(["AC-001"]);
  });

  it("parses task AC mappings", () => {
    const parsed = parseTasks("- [ ] T-001: Do it\n  - Covers: ac-001, AC-002\n- [x] T-002: Done");

    expect(parsed.tasks[0]).toMatchObject({ id: "T-001", acIds: ["AC-001", "AC-002"], done: false });
    expect(parsed.tasks[1]).toMatchObject({ id: "T-002", acIds: [], done: true });
  });

  it("builds AC map warnings and blocking issues", () => {
    const map = buildAcMap({
      changeId: "demo",
      specContent: "- AC-001: Exists",
      tasksContent: "- [ ] T-001: Bad ref\n  - Covers: AC-999",
      placeholderFiles: [{ path: "plan.md", content: "TBD" }],
    });

    expect(map.blockingIssues).toContain("Task T-001 references unknown Acceptance Criterion AC-999.");
    expect(map.warnings).toContain("plan.md:1 unresolved placeholder: TBD");
  });

  it("parses review status", () => {
    expect(parseReviewStatus("Status: approved-with-notes\n")).toBe("approved-with-notes");
    expect(parseReviewStatus("\uFEFFStatus: approved\n")).toBe("approved");
    expect(parseReviewStatus("Status: not-required\n")).toBe("unknown");
    expect(parseReviewStatus(null)).toBe("missing");
  });
});
