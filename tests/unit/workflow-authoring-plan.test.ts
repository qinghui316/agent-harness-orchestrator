import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  compileWorkflowGraphPlan,
  parseWorkflowAuthoringPlan,
  type AuthoredWorkflowGraphCompileOptions,
  type WorkflowAuthoringPlan,
} from "../../src/workflow-artifacts/manager.js";
import { validatePlanningProposalArtifacts } from "../../src/change/manager.js";

const references = {
  taskIds: ["T-001"],
  acIds: ["AC-001"],
};

const completeReferences = {
  taskIds: ["T-001", "T-002", "T-003"],
  acIds: ["AC-001", "AC-002", "AC-003"],
};

describe("fixed plan.md Workflow authoring contract", () => {
  it("keeps the tracked Skill example executable by the production parser", async () => {
    const reference = await readFile("templates/system-skills/aho-workflow-authoring/references/fixed-plan-format.md", "utf8");
    const example = [...reference.matchAll(/```json\s*([\s\S]*?)```/gi)]
      .map((match) => match[1])
      .find((block) => block?.includes('"mode"'));
    expect(example).toBeTruthy();
    expect(parseWorkflowAuthoringPlan(planMarkdown(JSON.parse(example!)), {
      taskIds: ["T-001"],
      acIds: ["AC-001", "AC-002"],
    }).mode).toBe("sequential-v1");
  });

  it("validates the complete user-readable worked example with the production contract", async () => {
    const reference = await readFile("templates/system-skills/aho-workflow-authoring/references/complete-example.md", "utf8");
    const envelopeText = /````json\s*([\s\S]*?)````/i.exec(reference)?.[1];
    expect(envelopeText).toBeTruthy();
    const envelope = JSON.parse(envelopeText!) as { specMd: string; planMd: string; tasksMd: string };

    const validated = validatePlanningProposalArtifacts(envelope);

    expect(validated.authored.mode).toBe("sequential-v1");
    expect(validated.criteria.map((item) => item.id)).toEqual(["AC-001", "AC-002", "AC-003"]);
    expect(envelope.planMd).toContain("## Goal");
    expect(envelope.planMd.indexOf("## Goal")).toBeLessThan(envelope.planMd.indexOf("## Workflow"));
  });

  it("parses exactly the fenced JSON under ## Workflow", () => {
    const workflow = parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("implement", ["T-001"], ["AC-001"], [], ["src/feature.ts"])],
    }), { taskIds: ["T-001"], acIds: ["AC-001"] });

    expect(workflow).toEqual({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("implement", ["T-001"], ["AC-001"], [], ["src/feature.ts"])],
    });
  });

  it("does not infer workflow topology from prose or another heading", () => {
    expect(() => parseWorkflowAuthoringPlan([
      "# Plan",
      "",
      "Run T-001 and then validate AC-001 in sequential-v1 mode.",
    ].join("\n"), references)).toThrow("exactly one ## Workflow");

    expect(() => parseWorkflowAuthoringPlan([
      "# Plan",
      "",
      "## Workflow JSON",
      "",
      "```json",
      JSON.stringify({ version: "1.0", mode: "sequential-v1", nodes: [] }),
      "```",
    ].join("\n"), references)).toThrow("exactly one ## Workflow");

    expect(() => parseWorkflowAuthoringPlan([
      "# Plan",
      "",
      "## Workflow",
      "",
      "Use sequential-v1 with T-001 before T-002.",
    ].join("\n"), references)).toThrow("prose is not a workflow definition");
  });

  it.each([
    ["missing node ids", { version: "1.0", mode: "sequential-v1", nodes: [{ ...node("implement"), id: undefined }] }, "nodes.0.id"],
    ["unknown fields", { version: "1.0", mode: "sequential-v1", nodes: [node("implement")], strategy: "infer" }, "Unrecognized key"],
    ["unsupported modes", { version: "1.0", mode: "pipeline-v1", nodes: [node("implement")] }, "mode"],
    ["empty prompts", { version: "1.0", mode: "sequential-v1", nodes: [{ ...node("implement"), prompt: "  " }] }, "prompt"],
    ["empty scopes", { version: "1.0", mode: "sequential-v1", nodes: [{ ...node("implement"), sourceScopes: [] }] }, "sourceScopes"],
  ])("rejects %s", (_label, workflow, expected) => {
    expect(() => parseWorkflowAuthoringPlan(planMarkdown(workflow), references)).toThrow(expected);
  });

  it("rejects duplicate node ids and duplicate node references", () => {
    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("same"), node("same", ["T-002"], ["AC-002"])],
    }), references)).toThrow("duplicate node id same");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [{ ...node("same"), taskIds: ["T-001", "t-001"] }],
    }), references)).toThrow("duplicate taskIds");
  });

  it("rejects unknown task, AC, and dependency references", () => {
    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("implement", ["T-999"])],
    }), references)).toThrow("unknown task T-999");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("implement", ["T-001"], ["AC-999"])],
    }), references)).toThrow("unknown acceptance criterion AC-999");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("implement", ["T-001"], ["AC-001"], ["missing"])],
    }), references)).toThrow("unknown dependency missing");
  });

  it("rejects accepted task and AC ids missing from the workflow", () => {
    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [node("implement")],
    }), completeReferences)).toThrow("does not cover accepted task ids: T-002, T-003");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [
        node("one", ["T-001"], ["AC-001"]),
        node("two", ["T-002"], ["AC-001"]),
        node("three", ["T-003"], ["AC-001"]),
      ],
    }), completeReferences)).toThrow("does not cover accepted acceptance criterion ids: AC-002, AC-003");
  });

  it("rejects dependency cycles", () => {
    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "ready-set-v1",
      nodes: [
        node("a", ["T-001"], ["AC-001"], ["c"]),
        node("b", ["T-002"], ["AC-002"], ["a"]),
        node("c", ["T-003"], ["AC-003"], ["b"]),
      ],
    }), completeReferences)).toThrow("a -> c -> b -> a");
  });

  it("rejects unsafe scopes, overlapping ready-set scopes, and unstructured prompts", () => {
    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [{ ...node("unsafe"), sourceScopes: ["../src/**"] }],
    }), references)).toThrow("unsafe source scope");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "ready-set-v1",
      nodes: [node("one", ["T-001"], ["AC-001"], [], ["src/**"]), node("two", ["T-002"], ["AC-002"], [], ["src/api/**"])],
    }), { taskIds: ["T-001", "T-002"], acIds: ["AC-001", "AC-002"] })).toThrow("overlapping source scopes");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "ready-set-v1",
      nodes: [node("one", ["T-001"], ["AC-001"], [], ["**/*.ts"]), node("two", ["T-002"], ["AC-002"], [], ["src/server.ts"])],
    }), { taskIds: ["T-001", "T-002"], acIds: ["AC-001", "AC-002"] })).toThrow("overlapping source scopes");

    expect(() => parseWorkflowAuthoringPlan(planMarkdown({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [{ ...node("prompt"), prompt: "Implement it." }],
    }), references)).toThrow("prompt must contain");
  });
});

describe("authored WorkflowGraphPlan compiler", () => {
  it("preserves authored ready-set topology and adds only the fixed execution envelope", () => {
    const plan: WorkflowAuthoringPlan = {
      version: "1.0",
      mode: "ready-set-v1",
      nodes: [
        node("api", ["T-001"], ["AC-001"], [], ["src/api/**"]),
        node("ui", ["T-002"], ["AC-002"], [], ["src/ui/**"]),
        node("verify", ["T-003"], ["AC-003"], ["api", "ui"], ["tests/**"]),
      ],
    };

    const first = compileWorkflowGraphPlan(plan, compileOptions());
    const second = compileWorkflowGraphPlan(plan, compileOptions());

    expect(second).toEqual(first);
    expect(first.nodes).toEqual(plan.nodes.map((item) => expect.objectContaining({
      ...item,
      stages: ["coder", "validation", "audit", "bounded-rework"],
    })));
    expect(first.edges.filter((edge) => edge.kind === "dependency")).toEqual([
      { from: "api", to: "verify", kind: "dependency" },
      { from: "ui", to: "verify", kind: "dependency" },
    ]);
    expect(first.edges.filter((edge) => edge.kind === "stage-order")).toHaveLength(9);
    expect(first.graphMode === "ready-set-v1" && first.waves).toEqual([
      expect.objectContaining({ index: 0, nodeIds: ["api", "ui"] }),
      expect.objectContaining({ index: 1, nodeIds: ["verify"] }),
    ]);
    expect(first.graphMode === "ready-set-v1" && first.nodes[0]?.recoveryKeyInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "nodePromptHash", value: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]));
  });

  it("does not invent sequential business dependencies, prompts, nodes, or scopes", () => {
    const plan: WorkflowAuthoringPlan = {
      version: "1.0",
      mode: "sequential-v1",
      nodes: [
        node("first", ["T-001"], ["AC-001"], [], ["src/first.ts"]),
        { ...node("second", ["T-002"], ["AC-002"], [], ["src/second.ts"]), prompt: structuredPrompt("Use the exact authored prompt.") },
      ],
    };

    const graph = compileWorkflowGraphPlan(plan, compileOptions({
      taskIds: ["T-001", "T-002"],
      acIds: ["AC-001", "AC-002"],
    }));

    expect(graph.nodes.map(({ id, prompt, dependsOn, sourceScopes }) => ({ id, prompt, dependsOn, sourceScopes }))).toEqual(
      plan.nodes.map(({ id, prompt, dependsOn, sourceScopes }) => ({ id, prompt, dependsOn, sourceScopes })),
    );
    expect(graph.edges.filter((edge) => edge.kind === "task-order")).toEqual([]);
    expect(graph.nodes).toHaveLength(2);
  });
});

function node(
  id: string,
  taskIds = ["T-001"],
  acIds = ["AC-001"],
  dependsOn: string[] = [],
  sourceScopes = ["src/**"],
) {
  return {
    id,
    title: `Node ${id}`,
    taskIds,
    acIds,
    prompt: structuredPrompt(`Implement ${id} and return verification evidence.`),
    dependsOn,
    sourceScopes,
  };
}

function structuredPrompt(objective: string): string {
  return `Objective: ${objective} Required behavior: Complete the accepted task. Constraints: Stay within the accepted source scopes. Expected evidence: Report changed files and verification results.`;
}

function planMarkdown(workflow: unknown): string {
  return [
    "# Plan",
    "",
    "## Approach",
    "Keep prose outside topology.",
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify(workflow, null, 2),
    "```",
    "",
  ].join("\n");
}

function compileOptions(referenceScope = completeReferences): AuthoredWorkflowGraphCompileOptions {
  return {
    id: "workflow-graph-fixed",
    changeId: "fixed-authoring",
    planArtifactRef: "harness/changes/active/fixed-authoring/plan.md",
    taskIds: referenceScope.taskIds,
    acIds: referenceScope.acIds,
    sourceArtifactHashes: { "plan.md": "abc123" },
    artifactRefs: ["harness/changes/active/fixed-authoring/plan.md"],
    artifact: ".agent-harness/workflow-graphs/workflow-graph-fixed.json",
    markdownArtifact: ".agent-harness/workflow-graphs/workflow-graph-fixed.md",
    createdAt: "2026-07-10T00:00:00.000Z",
  };
}
