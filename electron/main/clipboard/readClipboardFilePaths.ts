import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { clipboard } from "electron";
import { logger } from "../appLogger";

const execFileAsync = promisify(execFile);

const readClipboardFileDropListScript = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "$files = [System.Windows.Forms.Clipboard]::GetFileDropList()",
  "if ($files -eq $null -or $files.Count -eq 0) { [Console]::Out.Write(''); exit 0 }",
  "$joined = ($files -join \"`n\")",
  "$bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)",
  "[Console]::Out.Write([System.Convert]::ToBase64String($bytes))",
].join("; ");

export async function readClipboardFilePaths(): Promise<string[]> {
  if (process.platform !== "win32") {
    return [];
  }

  const formats = clipboard.availableFormats();
  const mayHaveFiles = formats.some((format) => {
    const normalized = format.toLowerCase();
    return normalized.includes("uri-list") || normalized.includes("filename") || normalized.includes("hdrop");
  });

  if (!mayHaveFiles) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Sta",
        "-Command",
        readClipboardFileDropListScript,
      ],
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 5000,
        windowsHide: true,
      },
    );

    const base64 = stdout.trim();

    if (!base64) {
      return [];
    }

    const decoded = Buffer.from(base64, "base64").toString("utf8");

    return decoded
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    logger.warn("clipboard", "file-drop-list:read-failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return [];
  }
}
