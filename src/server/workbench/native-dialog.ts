import { execFile } from "node:child_process";
import { platform } from "node:os";
import type { FolderDialogResult, NativeFolderDialogCommand } from "./types.js";

export async function openNativeFolderDialog(): Promise<FolderDialogResult> {
  const command = buildNativeFolderDialogCommand();
  if (!command) {
    return { path: null, canceled: false, supported: false, error: "Native folder picker is not supported on this platform." };
  }

  const result = await execFileBuffered(command.command, command.args, 120_000);
  if (result.error) {
    return { path: null, canceled: true, supported: true, error: result.error };
  }
  const selectedPath = result.stdout.trim().replace(/\/$/, "");
  return { path: selectedPath || null, canceled: selectedPath.length === 0, supported: true };
}

export function buildNativeFolderDialogCommand(currentPlatform = platform()): NativeFolderDialogCommand | null {
  if (currentPlatform === "win32") return buildWindowsFolderDialogCommand();
  if (currentPlatform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", 'POSIX path of (choose folder with prompt "Select an AHO project folder")'],
    };
  }
  if (currentPlatform === "linux") {
    return {
      command: "zenity",
      args: ["--file-selection", "--directory", "--title=Select an AHO project folder"],
    };
  }
  return null;
}

export function buildWindowsFolderDialogCommand(): NativeFolderDialogCommand {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$owner = New-Object System.Windows.Forms.Form;",
    "$owner.Text = 'Agent Harness Orchestrator';",
    "$owner.TopMost = $true;",
    "$owner.ShowInTaskbar = $true;",
    "$owner.StartPosition = 'CenterScreen';",
    "$owner.Width = 1;",
    "$owner.Height = 1;",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;",
    "$dialog.Description = 'Select an AHO project folder';",
    "$dialog.ShowNewFolderButton = $false;",
    "try {",
    "  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }",
    "} finally {",
    "  $owner.Dispose();",
    "}",
  ].join(" ");
  return { command: "powershell.exe", args: ["-NoProfile", "-Sta", "-Command", script] };
}

async function execFileBuffered(command: string, args: string[], timeout: number): Promise<{ stdout: string; error?: string }> {
  return new Promise((resolvePromise) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ stdout: typeof stdout === "string" ? stdout : "", error: typeof stderr === "string" && stderr.trim() ? stderr.trim() : error.message });
        return;
      }
      resolvePromise({ stdout: typeof stdout === "string" ? stdout : "" });
    });
  });
}
