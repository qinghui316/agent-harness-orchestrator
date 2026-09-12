import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNsisUpdateAdapter } from "../../src/desktop/nsis-update-adapter.js";

const state = vi.hoisted(() => ({
  instance: null as unknown,
  spawn: () => Promise.resolve(true),
  spawnCount: 0,
  prematureQuit: 0,
}));
vi.mock("electron-updater", () => ({
  default: {
    NsisUpdater: class {
      installerPath: string | null = "C:/verified/installer.exe";
      elevated = false;
      constructor() { state.instance = this; }
      on() { return this; }
      install(isSilent: boolean, isForceRunAfter: boolean) {
        return this.doInstall({ isSilent, isForceRunAfter, isAdminRightsRequired: this.elevated });
      }
      doInstall(_options: unknown): boolean { return false; }
      spawnLog(): Promise<boolean> { state.spawnCount += 1; return state.spawn(); }
      quitAndInstall() { state.prematureQuit += 1; }
    },
  },
}));

interface FixtureNsis {
  installerPath: string | null;
  elevated: boolean;
  launchVerifiedUpdate(): Promise<void>;
}
beforeEach(() => {
  state.instance = null;
  state.spawn = () => Promise.resolve(true);
  state.spawnCount = 0;
  state.prematureQuit = 0;
});
async function fixture(): Promise<FixtureNsis> {
  await createNsisUpdateAdapter({
    mode: "stable", owner: "qinghui316", repo: "agent-harness-orchestrator", publisherSubject: "CN=Fixture",
  });
  return state.instance as FixtureNsis;
}

describe("actual NSIS launch-boundary adapter", () => {
  it("waits for asynchronous launch failure without invoking the library quit path", async () => {
    const nsis = await fixture();
    state.spawn = async () => { await Promise.resolve(); throw new Error("CreateProcess failed"); };
    await expect(nsis.launchVerifiedUpdate()).rejects.toThrow("CreateProcess failed");
    expect(state.prematureQuit).toBe(0);
  });
  it("rejects elevation and missing installer paths before spawning", async () => {
    const nsis = await fixture();
    nsis.elevated = true;
    await expect(nsis.launchVerifiedUpdate()).rejects.toThrow("did not start");
    nsis.elevated = false;
    nsis.installerPath = null;
    await expect(nsis.launchVerifiedUpdate()).rejects.toThrow("did not start");
    expect(state.spawnCount).toBe(0);
  });
  it("requires affirmative launch evidence, not just a settled Promise", async () => {
    const nsis = await fixture();
    state.spawn = () => Promise.resolve(false);
    await expect(nsis.launchVerifiedUpdate()).rejects.toThrow("not confirmed");
    expect(state.prematureQuit).toBe(0);
  });
});
