import { generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { Buffer } from "node:buffer";
import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const backupDir = resolve(required("BEAVER_UPDATE_KEY_BACKUP_DIR"));
const passwordPath = resolve(required("BEAVER_UPDATE_KEY_PASSWORD_FILE"));
const publicPath = resolve(root, "src", "desktop", "update-public-keys.json");
const keyId = process.env.BEAVER_UPDATE_SIGNING_KEY_ID ?? "beaver-win-stable-2026-01";

if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(keyId)) throw new Error("Invalid update signing key id.");
assertOutsideRepository(backupDir);
assertOutsideRepository(passwordPath);
if (dirname(passwordPath).toLowerCase() === backupDir.toLowerCase()) {
  throw new Error("The encrypted key and its password recovery file must use separate directories.");
}

const passphrase = randomBytes(48).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const encryptedPrivateKey = privateKey.export({
  type: "pkcs8",
  format: "pem",
  cipher: "aes-256-cbc",
  passphrase,
}).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const probe = Buffer.from("beaver-code-update-key-recovery-v1", "utf8");
const signature = sign(null, probe, { key: encryptedPrivateKey, passphrase });
if (!verify(null, probe, publicKey, signature)) throw new Error("Signing key recovery drill failed.");

await mkdir(backupDir, { recursive: true });
await mkdir(dirname(passwordPath), { recursive: true });
await writeFile(resolve(backupDir, `${keyId}.encrypted-pkcs8.pem`), encryptedPrivateKey, { encoding: "utf8", flag: "wx", mode: 0o600 });
await writeFile(passwordPath, `${passphrase}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
await writeFile(publicPath, `${JSON.stringify([{ keyId, publicKey: publicKeyPem }], null, 2)}\n`, { encoding: "utf8", flag: "wx" });

console.log(`Created encrypted update key backup for ${keyId}.`);
console.log(`Encrypted key directory: ${backupDir}`);
console.log(`Separate password recovery file: ${passwordPath}`);
console.log(`Committed trust root candidate: ${publicPath}`);
console.log("Recovery signing and verification drill passed.");

function required(name) {
  const value = process.env[name];
  if (!value || /[\r\n\0]/.test(value)) throw new Error(`Missing or invalid ${name}.`);
  return value;
}

function assertOutsideRepository(path) {
  const pathRelativeToRoot = relative(root, path);
  const outside = isAbsolute(pathRelativeToRoot) || pathRelativeToRoot === ".."
    || pathRelativeToRoot.startsWith(`..${sep}`);
  if (!outside) {
    throw new Error("Private signing material must stay outside the repository.");
  }
}
