import { describe, expect, it } from "vitest";
import { WorkbenchRequestError } from "../../src/web/src/api.js";
import {
  ahoProgressLabel,
  sanitizeTechnicalDetail,
  toUserFacingFailure,
  userFacingErrorMessage,
} from "../../src/web/src/presentation/user-facing-language.js";

describe("user-facing language", () => {
  it("maps request status to an actionable summary without exposing the body", () => {
    const error = new WorkbenchRequestError(409, "revision conflict for requestId=req-secret");
    expect(userFacingErrorMessage(error, "save")).toBe("当前状态已经变化。刷新后再试一次。");
    expect(toUserFacingFailure(error, "save").technicalDetail).toContain("requestId=[身份已隐藏]");
    expect(userFacingErrorMessage(error, "save")).not.toContain("revision");
  });

  it("gives model, input, and unknown conflicts recovery actions that match the actual problem", () => {
    const modelError = new WorkbenchRequestError(409, "Selected reasoning effort is not supported by the current model.");
    expect(userFacingErrorMessage(modelError, "send"))
      .toBe("当前模型或推理设置不可用。重新选择模型或推理强度后重试。");

    const effortError = new WorkbenchRequestError(409, "Selected effort is unavailable.");
    expect(userFacingErrorMessage(effortError, "send"))
      .toBe("当前模型或推理设置不可用。重新选择模型或推理强度后重试。");

    const inputError = new WorkbenchRequestError(409, "This conversation needs user input.");
    expect(userFacingErrorMessage(inputError, "send"))
      .toBe("当前操作正在等待你的处理。先完成待确认事项，再重试。");

    const unknownConflict = new WorkbenchRequestError(409, "Conversation cannot accept this operation.");
    expect(userFacingErrorMessage(unknownConflict, "conversation"))
      .toBe("会话操作暂时无法完成。检查当前设置或待处理事项后重试。");
  });

  it("distinguishes connection failures from ordinary operation failures", () => {
    expect(userFacingErrorMessage(new TypeError("Failed to fetch"), "load"))
      .toBe("暂时无法连接到本地服务。确认 Workbench 正在运行后重试。");
    expect(userFacingErrorMessage(new Error("private failure"), "review"))
      .toBe("代码审查暂时无法开始。请重试。");
  });

  it("redacts local paths and private identities in diagnostic detail", () => {
    const detail = sanitizeTechnicalDetail(
      "C:\\Users\\qing hui\\repo\\file.ts, /home/qing hui/repo/file.ts; \\\\server\\shared folder\\file.ts, file:///C:/repo with spaces/file.ts; changeId=change-1 taskRunId=task-1 agentSurfaceId=surface-1 workerId=worker-1 payloadHash=secret-hash threadId=abc UUID 123e4567-e89b-42d3-a456-426614174000 deadbeefdeadbeefdeadbeefdeadbeef",
    );
    expect(detail).not.toContain("qinghui");
    expect(detail).not.toContain("server");
    expect(detail).not.toContain("threadId=abc");
    expect(detail).not.toContain("change-1");
    expect(detail).not.toContain("task-1");
    expect(detail).not.toContain("surface-1");
    expect(detail).not.toContain("worker-1");
    expect(detail).not.toContain("secret-hash");
    expect(detail).not.toContain("123e4567");
    expect(detail).not.toContain("deadbeef");
    expect(detail).toContain("threadId=[身份已隐藏]");
  });

  it("maps known AHO states without exposing raw enum values", () => {
    expect(ahoProgressLabel("planned")).toBe("计划中");
    expect(ahoProgressLabel("queued")).toBe("等待执行");
    expect(ahoProgressLabel("running")).toBe("执行中");
    expect(ahoProgressLabel("audit")).toBe("正在检查");
    expect(ahoProgressLabel("waiting-user")).toBe("等你确认");
    expect(ahoProgressLabel("completed")).toBe("已完成");
    expect(ahoProgressLabel("failed")).toBe("需要处理");
    expect(ahoProgressLabel("future-state")).toBe("状态更新");
  });
});
