import type { AiProviderSettingsCollection } from "./aiSettingsModel";
import {
  normalizeAiProviderSettings,
  validateAiProviderSettingsCollection,
} from "./aiSettingsModel";

export type MergeBackupMode = "merge" | "replace" | "add-new";

type ProfileMatchResult = {
  currentProfile: (AiProviderSettingsCollection["profiles"])[number];
  matchKey: "id" | "baseUrl" | "name";
};

function findProfileMatch(
  currentProfiles: readonly AiProviderSettingsCollection["profiles"][number][],
  backupProfile: AiProviderSettingsCollection["profiles"][number],
): ProfileMatchResult | null {
  const byId = currentProfiles.find((p) => p.id === backupProfile.id);
  if (byId) {
    return { currentProfile: byId, matchKey: "id" };
  }

  const byBaseUrl = currentProfiles.find(
    (p) => p.baseUrl === backupProfile.baseUrl && p.baseUrl !== "",
  );
  if (byBaseUrl) {
    return { currentProfile: byBaseUrl, matchKey: "baseUrl" };
  }

  const byName = currentProfiles.find(
    (p) => p.name === backupProfile.name && p.name !== "",
  );
  if (byName) {
    return { currentProfile: byName, matchKey: "name" };
  }

  return null;
}

function mergeProfiles(
  current: AiProviderSettingsCollection,
  backup: AiProviderSettingsCollection,
): AiProviderSettingsCollection["profiles"] {
  const merged: AiProviderSettingsCollection["profiles"] = [];
  const consumedCurrentIds = new Set<string>();

  for (const backupProfile of backup.profiles) {
    const availableCurrent = current.profiles.filter(
      (p) => !consumedCurrentIds.has(p.id),
    );
    const match = findProfileMatch(availableCurrent, backupProfile);

    if (match) {
      consumedCurrentIds.add(match.currentProfile.id);

      if (match.matchKey === "id") {
        merged.push({ ...match.currentProfile, ...backupProfile, id: match.currentProfile.id });
      } else {
        merged.push({ ...backupProfile });
      }
    } else {
      merged.push({ ...backupProfile });
    }
  }

  for (const currentProfile of current.profiles) {
    if (!consumedCurrentIds.has(currentProfile.id)) {
      merged.push({ ...currentProfile });
    }
  }

  return merged;
}

function replaceProfiles(
  current: AiProviderSettingsCollection,
  backup: AiProviderSettingsCollection,
): AiProviderSettingsCollection["profiles"] {
  return backup.profiles.map((p) => ({ ...p }));
}

function addNewProfiles(
  current: AiProviderSettingsCollection,
  backup: AiProviderSettingsCollection,
): AiProviderSettingsCollection["profiles"] {
  const result = current.profiles.map((p) => ({ ...p }));

  for (const backupProfile of backup.profiles) {
    const match = findProfileMatch(current.profiles, backupProfile);
    if (!match) {
      result.push({ ...backupProfile });
    }
  }

  return result;
}

export function mergeBackupIntoCurrent(
  currentRaw: AiProviderSettingsCollection,
  backupPayload: AiProviderSettingsCollection,
  mode: MergeBackupMode = "merge",
): AiProviderSettingsCollection {
  const current = normalizeAiProviderSettings(currentRaw);
  const backup = normalizeAiProviderSettings(backupPayload);

  let profiles: AiProviderSettingsCollection["profiles"];
  let actionOrder: AiProviderSettingsCollection["actionOrder"];
  let actionPreferences: AiProviderSettingsCollection["actionPreferences"];
  let recognitionSourcePreferences: AiProviderSettingsCollection["recognitionSourcePreferences"];

  if (mode === "replace") {
    profiles = replaceProfiles(current, backup);
    actionOrder = current.actionOrder;
    actionPreferences = current.actionPreferences;
    recognitionSourcePreferences = current.recognitionSourcePreferences;
  } else if (mode === "add-new") {
    profiles = addNewProfiles(current, backup);
    actionOrder = current.actionOrder;
    actionPreferences = current.actionPreferences;
    recognitionSourcePreferences = current.recognitionSourcePreferences;
  } else {
    profiles = mergeProfiles(current, backup);
    actionOrder = backup.actionOrder ?? current.actionOrder;
    recognitionSourcePreferences = backup.recognitionSourcePreferences;
    actionPreferences = backup.actionPreferences;
  }

  const activeProfileId = resolveActiveProfileIdAfterMerge(
    current.activeProfileId,
    profiles,
  );

  const result: AiProviderSettingsCollection = {
    activeProfileId,
    ...(actionOrder?.length ? { actionOrder } : {}),
    actionPreferences,
    recognitionSourcePreferences,
    profiles,
  };

  validateAiProviderSettingsCollection(result);

  return result;
}

function resolveActiveProfileIdAfterMerge(
  currentActiveId: string,
  profiles: AiProviderSettingsCollection["profiles"],
): string {
  if (profiles.some((p) => p.id === currentActiveId)) {
    return currentActiveId;
  }
  return profiles[0]?.id ?? "default";
}
