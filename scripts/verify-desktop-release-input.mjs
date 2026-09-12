import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";

const tag = process.env.BEAVER_RELEASE_TAG;
const expected = process.env.BEAVER_RELEASE_COMMIT;
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? "")
  || !/^[a-f0-9]{40}$/.test(expected ?? "")) throw new Error("An exact release tag and full commit are required.");
const git = (args) => execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
if (git(["rev-parse", "HEAD"]) !== expected || git(["rev-parse", tag + "^{commit}"]) !== expected) {
  throw new Error("Release identity does not match the checkout.");
}
if (git(["status", "--porcelain", "--untracked-files=normal"])) throw new Error("Release checkout is dirty.");
git(["merge-base", "--is-ancestor", expected, "origin/master"]);
const manifest = JSON.parse(await readFile("package.json", "utf8"));
if (tag !== "v" + manifest.version) throw new Error("Release version does not match its tag.");
