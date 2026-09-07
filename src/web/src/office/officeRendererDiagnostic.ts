export const OFFICE_RENDERER_DIAGNOSTIC_PREFIX = "BEAVER_CODE_AGENT_OFFICE_DIAGNOSTIC ";

export type OfficeRendererFailureStage = "application-init" | "context-lost" | "scene-build";
export type OfficeRendererFailureCategory =
  | "csp-compatibility"
  | "renderer-initialization"
  | "context-lost"
  | "asset-load"
  | "asset-decode"
  | "scene-build";

export type OfficeRendererFailure = {
  stage: OfficeRendererFailureStage;
  category: OfficeRendererFailureCategory;
  userMessage: string;
};

export function createOfficeRendererFailure(stage: OfficeRendererFailureStage, cause?: unknown): OfficeRendererFailure {
  const message = cause instanceof Error ? cause.message : "";
  if (stage === "context-lost") {
    return { stage, category: "context-lost", userMessage: "动画显示已中断，请重试。" };
  }
  if (message.includes("unsafe-eval")) {
    return { stage, category: "csp-compatibility", userMessage: "办公场景暂时无法显示，请重试。" };
  }
  if (/unable to load office|fetch|network/i.test(message)) {
    return { stage, category: "asset-load", userMessage: "办公场景资源加载失败，请重试。" };
  }
  if (/image|bitmap|decode|canvas 2d/i.test(message)) {
    return { stage, category: "asset-decode", userMessage: "办公场景资源无法显示，请重试。" };
  }
  if (stage === "application-init") {
    return { stage, category: "renderer-initialization", userMessage: "办公场景暂时无法显示，请重试。" };
  }
  return { stage, category: "scene-build", userMessage: "办公场景暂时无法显示，请重试。" };
}

export function reportOfficeRendererFailure(failure: OfficeRendererFailure): void {
  console.error(`${OFFICE_RENDERER_DIAGNOSTIC_PREFIX}${JSON.stringify({
    category: failure.category,
    stage: failure.stage,
  })}`);
}
