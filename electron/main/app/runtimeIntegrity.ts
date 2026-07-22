import { app, dialog } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logStartupEvent } from "../startupLog";
import { logger } from "../appLogger";

type IntegrityManifest = {
  productName: string;
  packageName: string;
  appId: string;
  author: string;
  generatedAt?: string;
  files: Record<string, string>;
};

export type IntegrityReport = {
  ok: boolean;
  reasons: string[];
};

const EXPECTED_PRODUCT_NAME = "素言";
const EXPECTED_PACKAGE_NAME = "suyan";
const EXPECTED_APP_ID = "local.suyan";
const EXPECTED_AUTHOR_FRAGMENT = "素言";

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function readPackageJson(appPath: string): { name?: string; author?: string; description?: string } | null {
  try {
    const raw = fs.readFileSync(path.join(appPath, "package.json"), "utf8");
    return JSON.parse(raw) as { name?: string; author?: string; description?: string };
  } catch {
    return null;
  }
}

function readManifest(appPath: string): IntegrityManifest | null {
  try {
    const raw = fs.readFileSync(path.join(appPath, "app-integrity.json"), "utf8");
    return JSON.parse(raw) as IntegrityManifest;
  } catch {
    return null;
  }
}

export function verifyRuntimeIntegrity(): IntegrityReport {
  if (!app.isPackaged) {
    return { ok: true, reasons: [] };
  }

  const reasons: string[] = [];
  const appPath = app.getAppPath();
  const packageJson = readPackageJson(appPath);
  const manifest = readManifest(appPath);

  if (app.getName() !== EXPECTED_PRODUCT_NAME) {
    reasons.push("app-name");
  }

  if (!packageJson) {
    reasons.push("package-json-missing");
  } else {
    if (packageJson.name !== EXPECTED_PACKAGE_NAME) {
      reasons.push("package-name");
    }

    const author = String(packageJson.author ?? "");
    if (!author.includes(EXPECTED_AUTHOR_FRAGMENT)) {
      reasons.push("package-author");
    }
  }

  if (!manifest) {
    reasons.push("manifest-missing");
  } else {
    if (manifest.productName !== EXPECTED_PRODUCT_NAME) {
      reasons.push("manifest-product");
    }
    if (manifest.packageName !== EXPECTED_PACKAGE_NAME) {
      reasons.push("manifest-package");
    }
    if (manifest.appId !== EXPECTED_APP_ID) {
      reasons.push("manifest-app-id");
    }
    if (!String(manifest.author ?? "").includes(EXPECTED_AUTHOR_FRAGMENT)) {
      reasons.push("manifest-author");
    }

    for (const [relativePath, expectedHash] of Object.entries(manifest.files ?? {})) {
      const absolutePath = path.join(appPath, ...relativePath.split("/"));
      if (!fs.existsSync(absolutePath)) {
        reasons.push(`missing:${relativePath}`);
        continue;
      }

      try {
        const actualHash = sha256File(absolutePath);
        if (actualHash !== expectedHash) {
          reasons.push(`hash:${relativePath}`);
        }
      } catch {
        reasons.push(`unreadable:${relativePath}`);
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function assertRuntimeIntegrityOrExit(): void {
  if (!app.isPackaged) {
    return;
  }

  const report = verifyRuntimeIntegrity();
  logStartupEvent("integrity:check", {
    ok: report.ok,
    reasons: report.reasons,
  });

  if (report.ok) {
    return;
  }

  logger.error("integrity", "runtime-integrity-failed", { reasons: report.reasons });

  try {
    dialog.showErrorBox(
      "素言",
      "应用文件完整性校验失败，程序可能已被篡改或损坏，即将退出。\n\n请重新安装官方版本。",
    );
  } catch {
  }

  app.exit(1);
}
