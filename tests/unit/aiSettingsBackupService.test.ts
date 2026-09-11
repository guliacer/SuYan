import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  userDataPath: "",
  saveResult: {
    canceled: false,
    filePath: "",
  } as Electron.SaveDialogReturnValue,
  openResult: {
    canceled: false,
    filePaths: [] as string[],
  } as Electron.OpenDialogReturnValue,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => runtime.userDataPath,
    getVersion: () => "9.8.7",
    isPackaged: false,
  },
  dialog: {
    showSaveDialog: vi.fn().mockImplementation(() => Promise.resolve(runtime.saveResult)),
    showOpenDialog: vi.fn().mockImplementation(() => Promise.resolve(runtime.openResult)),
  },
}));

vi.mock("../../electron/main/ai/aiSettingsStore", () => ({
  readPrivateAiProviderSettings: vi.fn(),
  writeAiProviderSettings: vi.fn(),
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { dialog } from "electron";
import {
  readPrivateAiProviderSettings,
  writeAiProviderSettings,
} from "../../electron/main/ai/aiSettingsStore";
import { toPublicAiProviderSettings } from "../../electron/main/ai/aiSettingsModel";
import type { AiProviderSettingsCollection } from "../../electron/main/ai/aiSettingsModel";
import {
  exportSettingsBackup,
  importSettingsPreview,
  importSettingsApply,
} from "../../electron/main/ai/aiSettingsBackupService";

const TEST_PASSWORD = "test-password-123";
const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-backup-test-"));
  tmpDirs.push(dir);
  return dir;
}

const defaultCurrentSettings = {
  activeProfileId: "default",
  actionPreferences: {} as Record<string, unknown>,
  recognitionSourcePreferences: {} as Record<string, unknown>,
  profiles: [
    {
      id: "default",
      name: "Main API",
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-real-key-12345",
      model: "gpt-4",
      models: [
        { id: "gpt-4", label: "GPT-4", capabilities: ["text" as const, "vision" as const] },
      ],
    },
  ],
};

const plainBackupPayload = {
  format: "suyan-ai-settings" as const,
  formatVersion: 1 as const,
  exportedAt: "2026-01-01T00:00:00.000Z",
  profiles: [
    {
      id: "exported-1",
      name: "Exported Provider",
      enabled: false,
      baseUrl: "https://api.anthropic.com/v1",
      hasApiKey: false,
      model: "claude-sonnet-4-20250514",
      models: [{ id: "claude-sonnet-4-20250514", label: "Claude Sonnet", capabilities: ["text"] }],
    },
  ],
  actionPreferences: {
    "prompt-category": { profileId: "exported-1", modelId: "claude-sonnet-4-20250514" },
  },
  recognitionSourcePreferences: { category: "image" as const, tags: "prompt" as const },
};

async function buildEncryptedFile(
  tmpDir: string,
  plainPayload: object,
  password: string,
): Promise<string> {
  const { encryptBackup } = await import("../../electron/main/ai/aiSettingsBackupCrypto");
  const plainText = JSON.stringify(plainPayload);
  const envelope = encryptBackup(plainText, password);
  const envelopeJson = {
    format: "suyan-ai-settings",
    formatVersion: 2,
    kdf: "scrypt",
    kdfParams: { N: 16384, r: 8, p: 1, keylen: 32 },
    salt: envelope.salt.toString("base64"),
    iv: envelope.iv.toString("base64"),
    authTag: envelope.authTag.toString("base64"),
    ciphertext: envelope.ciphertext.toString("base64"),
    exportedAt: new Date().toISOString(),
  };
  const filePath = path.join(tmpDir, "encrypted.suyan-ai");
  await fs.writeFile(filePath, JSON.stringify(envelopeJson), "utf8");
  return filePath;
}

describe("aiSettingsBackupService", () => {
  beforeEach(() => {
    runtime.userDataPath = "";
    runtime.saveResult = { canceled: false, filePath: "" };
    runtime.openResult = { canceled: false, filePaths: [] };

    vi.mocked(dialog.showSaveDialog).mockImplementation(() => Promise.resolve(runtime.saveResult));
    vi.mocked(dialog.showOpenDialog).mockImplementation(() => Promise.resolve(runtime.openResult));

    vi.mocked(readPrivateAiProviderSettings).mockImplementation(() =>
      Promise.resolve(defaultCurrentSettings),
    );
    vi.mocked(writeAiProviderSettings).mockImplementation(async (payload) => {
      const merged: AiProviderSettingsCollection = {
        activeProfileId: payload.activeProfileId,
        actionPreferences:
          (payload.actionPreferences as AiProviderSettingsCollection["actionPreferences"]) ??
          defaultCurrentSettings.actionPreferences,
        recognitionSourcePreferences:
          (payload.recognitionSourcePreferences as AiProviderSettingsCollection["recognitionSourcePreferences"]) ??
          defaultCurrentSettings.recognitionSourcePreferences,
        profiles: payload.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          enabled: p.enabled,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey ?? "",
          model: p.model,
          models: p.models ?? [],
        })),
      };
      return toPublicAiProviderSettings(merged);
    });
  });

  afterEach(async () => {
    vi.resetAllMocks();
    await Promise.all(
      tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})),
    );
  });

  describe("exportSettingsBackup", () => {
    it("plain export produces file with NO apiKey field but hasApiKey=true", async () => {
      const tmpDir = await makeTmpDir();
      const exportPath = path.join(tmpDir, "export.suyan-ai.json");
      runtime.saveResult = { canceled: false, filePath: exportPath };

      const result = await exportSettingsBackup({ type: "plain" });

      expect(result.canceled).toBe(false);
      expect(result.filePath).toBe(exportPath);
      expect(vi.mocked(dialog.showSaveDialog).mock.calls[0][0]).toMatchObject({
        defaultPath: expect.stringMatching(/^素言-v9\.8\.7-AI设置-普通-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.suyan-ai\.json$/),
      });

      const written = JSON.parse(await fs.readFile(exportPath, "utf8")) as Record<string, unknown>;
      expect(written.format).toBe("suyan-ai-settings");
      expect(written.formatVersion).toBe(1);

      const profiles = written.profiles as Array<Record<string, unknown>>;
      expect(profiles.length).toBe(1);
      expect(profiles[0].apiKey).toBeUndefined();
      expect(profiles[0].hasApiKey).toBe(true);
      expect(profiles[0].id).toBe("default");
      expect(profiles[0].name).toBe("Main API");
    });

    it("full export produces encrypted file readable by parseBackupFile", async () => {
      const { parseBackupFile } = await import("../../electron/main/ai/aiSettingsBackup");
      const tmpDir = await makeTmpDir();
      const exportPath = path.join(tmpDir, "encrypted.suyan-ai");
      runtime.saveResult = { canceled: false, filePath: exportPath };

      const result = await exportSettingsBackup({ type: "full", password: TEST_PASSWORD });

      expect(result.canceled).toBe(false);
      expect(result.filePath).toBe(exportPath);

      const raw = await fs.readFile(exportPath, "utf8");
      expect(vi.mocked(dialog.showSaveDialog).mock.calls[0][0]).toMatchObject({
        defaultPath: expect.stringMatching(/^素言-v9\.8\.7-AI设置-密码加密-.*\.suyan-ai$/),
      });
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      expect(envelope.format).toBe("suyan-ai-settings");
      expect(envelope.formatVersion).toBe(2);
      expect(typeof envelope.salt).toBe("string");
      expect(typeof envelope.iv).toBe("string");
      expect(typeof envelope.authTag).toBe("string");
      expect(typeof envelope.ciphertext).toBe("string");

      const parsed = parseBackupFile(raw, TEST_PASSWORD);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.data.formatVersion).toBe(1);
        expect(parsed.data.profiles.length).toBe(1);
      }
    });

    it("returns { canceled: true } when save dialog is canceled", async () => {
      runtime.saveResult = { canceled: true, filePath: "" };

      const result = await exportSettingsBackup({ type: "plain" });

      expect(result.canceled).toBe(true);
      expect(result.filePath).toBeUndefined();
    });

    it("sets correct file extension filters for plain export", async () => {
      const tmpDir = await makeTmpDir();
      runtime.saveResult = { canceled: false, filePath: path.join(tmpDir, "ai.suyan-ai.json") };

      await exportSettingsBackup({ type: "plain" });

      const dialogCall = vi.mocked(dialog.showSaveDialog).mock.calls[0][0] as {
        filters?: Array<{ name: string; extensions: string[] }>;
      };
      expect(dialogCall.filters?.[0]?.extensions).toContain("suyan-ai.json");
    });

    it("sets correct file extension filters for full export", async () => {
      const tmpDir = await makeTmpDir();
      runtime.saveResult = {
        canceled: false,
        filePath: path.join(tmpDir, "encrypted.suyan-ai"),
      };

      await exportSettingsBackup({ type: "full", password: TEST_PASSWORD });

      const dialogCall = vi.mocked(dialog.showSaveDialog).mock.calls[0][0] as {
        filters?: Array<{ name: string; extensions: string[] }>;
      };
      expect(dialogCall.filters?.[0]?.extensions).toContain("suyan-ai");
    });

    it("calls readPrivateAiProviderSettings", async () => {
      const tmpDir = await makeTmpDir();
      runtime.saveResult = { canceled: false, filePath: path.join(tmpDir, "ai.suyan-ai.json") };

      await exportSettingsBackup({ type: "plain" });

      expect(readPrivateAiProviderSettings).toHaveBeenCalledOnce();
    });
  });

  describe("importSettingsPreview", () => {
    it("returns summary without exposing keys for valid plain file", async () => {
      const tmpDir = await makeTmpDir();
      const filePath = path.join(tmpDir, "backup.suyan-ai.json");
      await fs.writeFile(filePath, JSON.stringify(plainBackupPayload), "utf8");
      runtime.openResult = { canceled: false, filePaths: [filePath] };

      const summary = await importSettingsPreview();

      expect(summary.token).toBeDefined();
      expect(typeof summary.token).toBe("string");
      expect(summary.token.length).toBe(48);
      expect(summary.fileName).toBe("backup.suyan-ai.json");
      expect(summary.formatVersion).toBe(1);
      expect(summary.providerCount).toBeGreaterThanOrEqual(1);
      expect(summary.errors).toBeUndefined();

      const summaryStr = JSON.stringify(summary);
      expect(summaryStr).not.toContain("sk-");
      expect(summaryStr).not.toContain("real-key");
    });

    it("returns canceled-style result when open dialog is canceled", async () => {
      runtime.openResult = { canceled: true, filePaths: [] };

      await expect(importSettingsPreview()).rejects.toThrow();
    });

    it("propagates error for encrypted file without password", async () => {
      const tmpDir = await makeTmpDir();
      const encPath = await buildEncryptedFile(tmpDir, plainBackupPayload, TEST_PASSWORD);
      runtime.openResult = { canceled: false, filePaths: [encPath] };

      await expect(importSettingsPreview()).rejects.toThrow();
    });

    it("generates valid hex token of 24 bytes", async () => {
      const tmpDir = await makeTmpDir();
      const filePath = path.join(tmpDir, "backup.suyan-ai.json");
      await fs.writeFile(filePath, JSON.stringify(plainBackupPayload), "utf8");
      runtime.openResult = { canceled: false, filePaths: [filePath] };

      const summary = await importSettingsPreview();
      expect(/^[0-9a-f]{48}$/.test(summary.token)).toBe(true);
    });

    it("token cache entry expires after 10 minutes", async () => {
      const tmpDir = await makeTmpDir();
      const filePath = path.join(tmpDir, "backup.suyan-ai.json");
      await fs.writeFile(filePath, JSON.stringify(plainBackupPayload), "utf8");
      runtime.openResult = { canceled: false, filePaths: [filePath] };

      const summary = await importSettingsPreview();

      const origDateNow = Date.now;
      Date.now = () => origDateNow() + 11 * 60 * 1000;

      await expect(importSettingsApply(summary.token, "merge")).rejects.toThrow();

      Date.now = origDateNow;
    });

    it("throws for non-suyan-ai-settings file (raw ai-settings.json)", async () => {
      const tmpDir = await makeTmpDir();
      const filePath = path.join(tmpDir, "ai-settings.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ schemaVersion: 3, activeProfileId: "default", profiles: [] }),
        "utf8",
      );
      runtime.openResult = { canceled: false, filePaths: [filePath] };

      await expect(importSettingsPreview()).rejects.toThrow();
    });
  });

  describe("importSettingsApply", () => {
    async function getValidToken(
      backupPayload = plainBackupPayload,
    ): Promise<string> {
      const tmpDir = await makeTmpDir();
      const filePath = path.join(tmpDir, "backup.suyan-ai.json");
      await fs.writeFile(filePath, JSON.stringify(backupPayload), "utf8");
      runtime.openResult = { canceled: false, filePaths: [filePath] };

      const summary = await importSettingsPreview();
      return summary.token;
    }

    it("merge mode: combines profiles from current and backup", async () => {
      const backupWithExtraProfile = {
        ...plainBackupPayload,
        profiles: [
          ...plainBackupPayload.profiles,
          {
            id: "new-exported",
            name: "New Exported",
            enabled: false,
            baseUrl: "https://api.new.com/v1",
            hasApiKey: false,
            model: "new-model",
            models: [{ id: "new-model", label: "New Model", capabilities: ["text"] }],
          },
        ],
      };
      const token = await getValidToken(backupWithExtraProfile);

      const result = await importSettingsApply(token, "merge");

      expect(result.profiles.length).toBeGreaterThanOrEqual(2);
      expect(result.activeProfileId).toBeDefined();
      expect(writeAiProviderSettings).toHaveBeenCalledOnce();
    });

    it("replace mode: replaces all profiles with backup profiles", async () => {
      const token = await getValidToken();

      const result = await importSettingsApply(token, "replace");

      expect(result.profiles.length).toBe(1);
      expect(result.profiles[0].id).toBe("exported-1");
      expect(result.profiles[0].name).toBe("Exported Provider");
    });

    it("add-new mode: only adds profiles not found in current", async () => {
      const token = await getValidToken();

      const result = await importSettingsApply(token, "add-new");

      const currentIds = defaultCurrentSettings.profiles.map((p) => p.id);
      const expectedCount =
        defaultCurrentSettings.profiles.length +
        plainBackupPayload.profiles.filter((p) => !currentIds.includes(p.id)).length;
      expect(result.profiles.length).toBe(expectedCount);
    });

    it("throws when token has expired", async () => {
      const token = await getValidToken();

      const origDateNow = Date.now;
      Date.now = () => origDateNow() + 11 * 60 * 1000;

      await expect(importSettingsApply(token, "merge")).rejects.toThrow();
      expect(writeAiProviderSettings).not.toHaveBeenCalled();

      Date.now = origDateNow;
    });

    it("throws when token is not found", async () => {
      await expect(importSettingsApply("nonexistent-token-abc123", "merge")).rejects.toThrow();
      expect(writeAiProviderSettings).not.toHaveBeenCalled();
    });

    it("calls writeAiProviderSettings and returns public shape", async () => {
      const publicResult = toPublicAiProviderSettings(defaultCurrentSettings);
      vi.mocked(writeAiProviderSettings).mockResolvedValueOnce(publicResult);

      const token = await getValidToken();
      const result = await importSettingsApply(token, "merge");

      expect(writeAiProviderSettings).toHaveBeenCalledOnce();
      expect(result).toHaveProperty("profiles");
      expect(result).toHaveProperty("activeProfileId");
      expect(result).toHaveProperty("hasApiKey");
      expect(result).toHaveProperty("apiKeyPreview");
      expect(result).toHaveProperty("enabled");
      expect(result).toHaveProperty("model");
      expect(result.apiKeyPreview).not.toContain("sk-real-key-12345");
    });

    it("applies action preferences from backup in merge mode", async () => {
      const token = await getValidToken();

      const result = await importSettingsApply(token, "merge");

      expect(result.actionPreferences).toEqual(plainBackupPayload.actionPreferences);
    });

    it("preserves current action preferences in replace mode when profile survives", async () => {
      const settingsWithPrefs: typeof defaultCurrentSettings = {
        ...defaultCurrentSettings,
        profiles: [
          {
            id: "exported-1",
            name: "Exported Provider",
            enabled: true,
            baseUrl: "https://api.anthropic.com/v1",
            apiKey: "sk-real-key-12345",
            model: "claude-sonnet-4-20250514",
            models: [
              { id: "claude-sonnet-4-20250514", label: "Claude Sonnet", capabilities: ["text"] },
            ],
          },
        ],
        actionPreferences: {
          "prompt-category": { profileId: "exported-1", modelId: "claude-sonnet-4-20250514" },
        },
      };
      vi.mocked(readPrivateAiProviderSettings).mockResolvedValue(settingsWithPrefs);

      const token = await getValidToken();
      const result = await importSettingsApply(token, "replace");

      expect(result.actionPreferences).toEqual(settingsWithPrefs.actionPreferences);
    });

    it("preserves current action preferences in add-new mode", async () => {
      const settingsWithPrefs = {
        ...defaultCurrentSettings,
        actionPreferences: {
          "prompt-category": { profileId: "default", modelId: "gpt-4" },
        },
      };
      vi.mocked(readPrivateAiProviderSettings).mockResolvedValue(settingsWithPrefs);

      const token = await getValidToken();
      const result = await importSettingsApply(token, "add-new");

      expect(result.actionPreferences).toEqual(settingsWithPrefs.actionPreferences);
    });
  });
});
