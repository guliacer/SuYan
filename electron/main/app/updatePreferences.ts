import { app } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { AppUpdatePreferences } from "../../../src/types/suyanApi";
import { logger } from "../appLogger";

const settingsFileName = "update-preferences.json";

export const defaultAppUpdatePreferences: AppUpdatePreferences = {
  automaticCheck: true,
  ignoredVersion: null,
};

export function readAppUpdatePreferences(): AppUpdatePreferences {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    return normalizeAppUpdatePreferences(JSON.parse(raw));
  } catch {
    return { ...defaultAppUpdatePreferences };
  }
}

export async function writeAppUpdatePreferences(input: unknown): Promise<AppUpdatePreferences> {
  const preferences = normalizeAppUpdatePreferences(input);
  const settingsPath = getSettingsPath();
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;

  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await fsp.rename(temporaryPath, settingsPath);

  logger.info("app", "update-preferences:saved", {
    automaticCheck: preferences.automaticCheck,
    ignoredVersion: preferences.ignoredVersion,
  });

  return preferences;
}

export function normalizeAppUpdatePreferences(input: unknown): AppUpdatePreferences {
  if (!input || typeof input !== "object") {
    return { ...defaultAppUpdatePreferences };
  }

  const record = input as Record<string, unknown>;
  const ignoredVersion = typeof record.ignoredVersion === "string" && record.ignoredVersion.trim().length > 0
    ? record.ignoredVersion.trim().replace(/^v/i, "")
    : null;

  return {
    automaticCheck: record.automaticCheck !== false,
    ignoredVersion,
  };
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), settingsFileName);
}
