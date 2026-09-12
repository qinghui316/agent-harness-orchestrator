import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

export interface DesktopSignatureEvidence {
  readonly status: number;
  readonly path: string;
  readonly subject: string;
  readonly timestamped: boolean;
  readonly productVersion?: string;
  readonly productName?: string;
}

export interface DesktopSignedProduct {
  readonly version: string;
  readonly productName: string;
}

export function validateDesktopSignatureEvidence(
  evidence: DesktopSignatureEvidence,
  file: string,
  publisherSubject: string,
  product?: DesktopSignedProduct,
): void {
  if (evidence.status !== 0 || evidence.subject !== publisherSubject || !evidence.timestamped
    || normalize(evidence.path).toLowerCase() !== normalize(file).toLowerCase()) {
    throw new Error("Update signature, timestamp or publisher verification failed.");
  }
  if (product && (evidence.productName !== product.productName
    || (evidence.productVersion !== product.version && evidence.productVersion !== product.version + ".0"))) {
    throw new Error("Signed update product or version does not match the offered update.");
  }
}

/** Constant script; filenames enter as environment data, never interpolated shell code. */
export async function verifyDesktopUpdateSignature(file: string, publisherSubject: string, product: DesktopSignedProduct): Promise<void> {
  if (process.platform !== "win32" || !isAbsolute(file) || !publisherSubject) {
    throw new Error("Windows signature verification is unavailable.");
  }
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !isAbsolute(systemRoot)) throw new Error("Windows verification runtime is unavailable.");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$signature = Get-AuthenticodeSignature -LiteralPath $env:BEAVER_UPDATE_VERIFY_FILE",
    "if ($null -eq $signature) { throw 'Signature unavailable' }",
    "$version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:BEAVER_UPDATE_VERIFY_FILE)",
    "@{ status = [int]$signature.Status; path = $signature.Path; subject = $signature.SignerCertificate.Subject; timestamped = ($null -ne $signature.TimeStamperCertificate); productVersion = $version.ProductVersion; productName = $version.ProductName } | ConvertTo-Json -Compress",
  ].join("; ");
  const output = await new Promise<string>((resolve, reject) => {
    execFile(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 20_000, maxBuffer: 16_384, encoding: "utf8",
        env: { ...process.env, BEAVER_UPDATE_VERIFY_FILE: file } },
      (error, stdout, stderr) => {
        if (error || stderr.trim()) reject(new Error("Windows signature verification did not succeed."));
        else resolve(stdout);
      });
  });
  let evidence: unknown;
  try { evidence = JSON.parse(output.trim()); }
  catch { throw new Error("Windows signature evidence is invalid."); }
  if (!evidence || typeof evidence !== "object") throw new Error("Windows signature evidence is missing.");
  const record = evidence as Record<string, unknown>;
  if (typeof record.status !== "number" || typeof record.path !== "string"
    || typeof record.subject !== "string" || typeof record.timestamped !== "boolean") {
    throw new Error("Windows signature evidence is incomplete.");
  }
  validateDesktopSignatureEvidence(record as unknown as DesktopSignatureEvidence, file, publisherSubject, product);
}

export async function verifyDesktopUpdateHash(file: string, sha512: string): Promise<void> {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error("Update checksum is invalid.");
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("base64") !== sha512) throw new Error("Update checksum verification failed.");
}
