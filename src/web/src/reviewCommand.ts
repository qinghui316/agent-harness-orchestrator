import type { ProviderReviewTarget } from "./types.js";

export type ParsedReviewCommand =
  | { kind: "not-review" }
  | { kind: "open-selector" }
  | { kind: "target"; target: ProviderReviewTarget }
  | { kind: "invalid"; message: string };

export function parseReviewCommand(value: string): ParsedReviewCommand {
  const text = value.trim();
  if (!/^\/review(?:\s|$)/i.test(text)) return { kind: "not-review" };
  const rest = text.slice(7).trim();
  if (!rest) return { kind: "open-selector" };
  const [verb = "", ...parts] = rest.split(/\s+/);
  const tail = parts.join(" ").trim();
  if (verb.toLowerCase() === "base") {
    return tail ? { kind: "target", target: { type: "base-branch", branch: tail } }
      : { kind: "invalid", message: "请输入要对比的基准分支。" };
  }
  if (verb.toLowerCase() === "commit") {
    const [sha = "", ...titleParts] = parts;
    return sha ? { kind: "target", target: { type: "commit", sha, ...(titleParts.length ? { title: titleParts.join(" ") } : {}) } }
      : { kind: "invalid", message: "请输入要审查的 commit SHA。" };
  }
  if (verb.toLowerCase() === "custom") {
    return tail ? { kind: "target", target: { type: "custom", instructions: tail } }
      : { kind: "invalid", message: "请输入自定义审查要求。" };
  }
  return { kind: "target", target: { type: "custom", instructions: rest } };
}
