import { describe, expect, it } from "vitest";
import { withoutUpdateSigningSecrets } from "../../scripts/update-signing-environment.mjs";

describe("desktop update signing environment", () => {
  it("removes every signing secret from unprivileged build and smoke children", () => {
    expect(withoutUpdateSigningSecrets({
      PATH: "safe",
      BEAVER_UPDATE_SIGNING_PRIVATE_KEY: "private",
      BEAVER_UPDATE_SIGNING_KEY_PASSWORD: "password",
      BEAVER_UPDATE_SIGNING_KEY_ID: "key-id",
    })).toEqual({ PATH: "safe" });
  });
});
