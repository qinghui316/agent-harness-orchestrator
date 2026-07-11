import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHarnessEngineeringAssignment, parseHarnessEngineeringPatchPackage } from "../../src/agent-task/harness-engineering-contract.js";

const root = join(process.cwd(), "templates", "system-skills");
const skillRoot = join(root, "aho-harness-engineering");

describe("AHO Harness engineering Skill", () => {
  it("is the only Harness Skill entry and routes only Runtime-assigned modes", async () => {
    expect(existsSync(join(root, "aho-harness-onboarding"))).toBe(false);
    const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
    expect(skill).toContain("name: aho-harness-engineering");
    for (const mode of ["onboard", "audit", "maintain-assigned-closeout", "evolve-assigned-window"]) {
      expect(skill).toContain(`\`${mode}\``);
    }
    expect(skill).toContain("Never infer a mode from `pending.md`");
    expect(skill).toContain("Do not detect thresholds");
    expect(skill).toContain("Do not edit files, apply patches, close Changes");
  });

  it("provides a parseable declarative PatchPackage example without path or lifecycle authority", async () => {
    const contract = await readFile(join(skillRoot, "references", "output-contract.md"), "utf8");
    const match = contract.match(/```json\s*([\s\S]*?)```/);
    expect(match?.[1]).toBeTruthy();
    const value = JSON.parse(match![1]!) as Record<string, unknown>;
    expect(value).toMatchObject({
      mode: "maintain-assigned-closeout",
      assignmentId: "assigned-id",
      inputCheckpoint: "checkpoint-hash",
      policyVersion: "policy-v1",
      sourceWindowHash: "window-hash",
      status: "ready",
    });
    const patches = value.patches as Array<Record<string, unknown>>;
    expect(patches[0]).toHaveProperty("targetId", "allowed-target-id");
    expect(patches[0]).not.toHaveProperty("path");
    expect(contract).not.toContain('"applyCommand"');
    expect(contract).not.toContain('"closeChange"');
    const assignment = parseHarnessEngineeringAssignment({
      mode: "maintain-assigned-closeout",
      projectId: "demo",
      assignmentId: "assigned-id",
      inputCheckpoint: "checkpoint-hash",
      policyVersion: "policy-v1",
      sourceWindowHash: "window-hash",
      evidenceRefs: ["..."],
      currentDocumentRefs: [],
      currentStableMemoryRefs: [],
      allowedTargets: [{ targetId: "allowed-target-id", beforeHash: "..." }],
      requiredVerification: ["assigned-verification-id"],
    });
    expect(parseHarnessEngineeringPatchPackage(assignment, value)).toMatchObject({ status: "ready" });
  });

  it("fails closed for forged modes, lineage, targets, and nested command authority", () => {
    expect(() => parseHarnessEngineeringAssignment({ projectId: "demo" })).toThrow();
    expect(() => parseHarnessEngineeringAssignment({
      mode: "user-selected", projectId: "demo", assignmentId: "a", inputCheckpoint: "c", policyVersion: "p",
      sourceWindowHash: "w", evidenceRefs: ["e"], currentDocumentRefs: [], currentStableMemoryRefs: [], allowedTargets: [], requiredVerification: [],
    })).toThrow();
    const assignment = parseHarnessEngineeringAssignment({
      mode: "evolve-assigned-window", projectId: "demo", assignmentId: "a", inputCheckpoint: "c", policyVersion: "p",
      sourceWindowHash: "w", evidenceRefs: ["e"], currentDocumentRefs: [], currentStableMemoryRefs: [],
      allowedTargets: [{ targetId: "docs", beforeHash: "before" }], requiredVerification: ["lint"],
    });
    const base = {
      mode: assignment.mode, assignmentId: "a", inputCheckpoint: "c", policyVersion: "p", sourceWindowHash: "w",
      summary: "result", observations: [], decisions: [], context: null, verificationRequests: ["lint"], warnings: [], status: "ready",
    };
    expect(() => parseHarnessEngineeringPatchPackage(assignment, { ...base, patches: [{
      targetId: "other", beforeHash: "before", afterHash: "after", reason: "x", evidenceRefs: ["e"], operations: [{ kind: "replacement", replacement: "x" }],
    }] })).toThrow("not allowed");
    expect(() => parseHarnessEngineeringPatchPackage(assignment, { ...base, patches: [{
      targetId: "docs", beforeHash: "before", afterHash: "after", reason: "x", evidenceRefs: ["e"], operations: [{ kind: "command", command: "aho close" }],
    }] })).toThrow();
    expect(() => parseHarnessEngineeringPatchPackage(assignment, {
      ...base, observations: [{ text: "forged", evidenceRefs: ["outside"] }], patches: [],
    })).toThrow("outside the assignment");
    expect(() => parseHarnessEngineeringPatchPackage(assignment, {
      ...base, verificationRequests: ["unknown"], patches: [],
    })).toThrow("outside the assignment");
    expect(() => parseHarnessEngineeringAssignment({
      mode: "audit", projectId: "demo", assignmentId: "a", inputCheckpoint: "c", policyVersion: "p",
      sourceWindowHash: null, evidenceRefs: ["e"], currentDocumentRefs: [], currentStableMemoryRefs: [],
      allowedTargets: [{ targetId: "docs", beforeHash: "a" }, { targetId: "docs", beforeHash: "b" }], requiredVerification: [],
    })).toThrow("unique");
  });
});
