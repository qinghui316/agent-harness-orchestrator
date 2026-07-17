// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunReplay } from "../../src/web/src/panels/workbench/RunReplayPanel.js";

afterEach(cleanup);

describe("Run replay panel", () => {
  it("does not reconstruct conversation events from provider raw JSONL", () => {
    const replayStream = {
      run: { id: "run-raw", runtime: "provider-runtime", status: "completed", startedAt: "2026-07-15T00:00:00.000Z", finishedAt: "2026-07-15T00:00:01.000Z" },
      live: false,
      events: [],
      artifacts: [{
        key: "providerEvents",
        path: "runs/run-raw/provider-events.jsonl",
        kind: "jsonl",
        exists: true,
        preview: JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "npm test", exit_code: 0 } }),
      }],
      diagnostics: [],
    };

    render(<RunReplay stream={replayStream} run={replayStream.run} />);
    expect(screen.getByText("暂无可读转录")).toBeTruthy();
    expect(screen.queryByText("Command completed")).toBeNull();
  });
});
