import { resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { readFileSync } from "node:fs";

export function desktopBuildVariant(root, packageVersion, env = process.env) {
  const channel = env.BEAVER_BUILD_CHANNEL ?? "internal";
  if (!["internal", "test", "stable"].includes(channel)) throw new Error("Invalid desktop build channel.");
  const version = channel === "test" ? env.BEAVER_TEST_VERSION ?? packageVersion : packageVersion;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error("Invalid desktop version.");
  const hasSigningCredential = Boolean(env.CSC_LINK || env.WIN_CSC_LINK);
  const hasPublisherSubject = Boolean(env.BEAVER_PUBLISHER_SUBJECT);
  if (channel === "stable" && hasSigningCredential !== hasPublisherSubject) {
    throw new Error("Stable Authenticode requires both the signing credential and publisher subject.");
  }
  const signing = channel === "test" || (channel === "stable" && hasSigningCredential);
  let updatePolicy = { mode: "disabled" };
  if (channel === "test") {
    const publisherSubject = env.BEAVER_PUBLISHER_SUBJECT;
    if (!publisherSubject?.startsWith("CN=") || publisherSubject.length > 512 || /[\r\n\0]/.test(publisherSubject)) {
      throw new Error("A signing publisher subject is required for this build.");
    }
    if (!env.CSC_LINK && !env.WIN_CSC_LINK) {
      throw new Error("Signing integration is not configured. No signed package will be produced.");
    }
    const url = new URL(env.BEAVER_TEST_UPDATE_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.hostname === "github.com" || url.hostname.endsWith(".github.com")) throw new Error("Invalid isolated test update source.");
    updatePolicy = { mode: "test", feedUrl: url.href, publisherSubject };
  } else if (channel === "stable") {
    const keyPath = resolve(root, env.BEAVER_UPDATE_PUBLIC_KEYS_FILE ?? "src/desktop/update-public-keys.json");
    let trustedKeys;
    try { trustedKeys = JSON.parse(readFileSync(keyPath, "utf8")); }
    catch { throw new Error("Stable update trust roots are unavailable."); }
    updatePolicy = {
      mode: "stable", owner: "qinghui316", repo: "beaver-code", trustedKeys,
      ...(signing ? { authenticodePublisher: env.BEAVER_PUBLISHER_SUBJECT } : {}),
    };
  }
  const test = channel === "test";
  const artifactPrefix = test ? "Beaver-Code-Test-Setup" : "Beaver-Code-Setup";
  const output = resolve(root, "release", "desktop", channel);
  return {
    channel, version, updatePolicy, output, artifactPrefix,
    config: {
      extends: resolve(root, "electron-builder.yml"),
      appId: test ? "com.agentharness.desktop.update-test" : "com.agentharness.desktop",
      productName: test ? "Beaver Code Update Test" : "Beaver Code",
      artifactName: artifactPrefix + "-${version}-win-${arch}.${ext}",
      directories: { output },
      extraMetadata: { version, ...(test ? { name: "beaver-code-update-test" } : {}) },
      win: {
        executableName: test ? "BeaverCodeUpdateTest" : "BeaverCode",
        forceCodeSigning: signing,
        verifyUpdateCodeSignature: true,
        ...(signing ? { signtoolOptions: {
          publisherName: updatePolicy.publisherSubject, signingHashAlgorithms: ["sha256"],
          rfc3161TimeStampServer: "http://timestamp.digicert.com",
        } } : { signExecutable: false }),
      },
      nsis: {
        shortcutName: test ? "Beaver Code Update Test" : "Beaver Code",
        ...(test ? { runAfterFinish: false } : {}),
      },
      publish: channel === "internal" ? null : channel === "test"
        ? { provider: "generic", url: updatePolicy.feedUrl }
        : { provider: "github", owner: "qinghui316", repo: "beaver-code", releaseType: "draft" },
    },
  };
}
