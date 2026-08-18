import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderSettingsCollection } from "../../electron/main/ai/aiSettingsModel";

const mockDeriveKey = vi.fn();
const mockEncryptBackup = vi.fn();
const mockDecryptBackup = vi.fn();

vi.mock("../../electron/main/ai/aiSettingsBackupCrypto", () => ({
  deriveKey: (...args: unknown[]) => mockDeriveKey(...args),
  encryptBackup: (...args: unknown[]) => mockEncryptBackup(...args),
  decryptBackup: (...args: unknown[]) => mockDecryptBackup(...args),
}));

const {
  serializePlainBackup,
  serializeFullBackup,
  parseBackupFile,
  migrateBackupPayload,
} = await import("../../electron/main/ai/aiSettingsBackup");

const sampleSettings: AiProviderSettingsCollection = {
  activeProfileId: "p1",
  actionPreferences: {
    "prompt-category": {
      profileId: "p1",
      modelId: "gpt-4",
      customInstructions: "分类提示",
    },
  },
  recognitionSourcePreferences: { category: "image", tags: "prompt" },
  profiles: [
    {
      id: "p1",
      name: "主 API",
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-secret-key-12345",
      model: "gpt-4",
      models: [
        { id: "gpt-4", label: "GPT-4", capabilities: ["text", "vision"] },
      ],
    },
    {
      id: "p2",
      name: "备用 API",
      enabled: false,
      baseUrl: "https://api.other.com/v1",
      apiKey: "",
      model: "claude-3",
      models: [
        { id: "claude-3", label: "Claude 3", capabilities: ["text"] },
      ],
    },
  ],
  actionOrder: ["prompt-category", "prompt-tags"],
};

describe("AI settings backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("serializePlainBackup", () => {
    it("produces formatVersion 1 envelope with suyan-ai-settings format", () => {
      const backup = serializePlainBackup(sampleSettings);

      expect(backup.format).toBe("suyan-ai-settings");
      expect(backup.formatVersion).toBe(1);
      expect(typeof backup.exportedAt).toBe("string");
      expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
    });

    it("never includes apiKey in any profile", () => {
      const backup = serializePlainBackup(sampleSettings);
      const json = JSON.stringify(backup);

      expect(json).not.toContain('"apiKey"');
      expect(json).not.toContain('"apiKeyEncrypted"');
    });

    it("sets hasApiKey true for profiles with key and false for those without", () => {
      const backup = serializePlainBackup(sampleSettings);
      const p1 = backup.profiles.find((p) => p.id === "p1");
      const p2 = backup.profiles.find((p) => p.id === "p2");

      expect(p1?.hasApiKey).toBe(true);
      expect(p2?.hasApiKey).toBe(false);
    });

    it("preserves profiles, actionPreferences, recognitionSourcePreferences, actionOrder", () => {
      const backup = serializePlainBackup(sampleSettings);

      expect(backup.profiles).toHaveLength(2);
      expect(backup.profiles[0].id).toBe("p1");
      expect(backup.profiles[0].name).toBe("主 API");
      expect(backup.profiles[0].baseUrl).toBe("https://api.example.com/v1");
      expect(backup.profiles[0].model).toBe("gpt-4");
      expect(backup.actionPreferences["prompt-category"]).toEqual({
        profileId: "p1",
        modelId: "gpt-4",
        customInstructions: "分类提示",
      });
      expect(backup.recognitionSourcePreferences).toEqual({
        category: "image",
        tags: "prompt",
      });
      expect(backup.actionOrder).toEqual([
        "prompt-category",
        "prompt-tags",
      ]);
    });
  });

  describe("serializeFullBackup", () => {
    it("produces formatVersion 2 envelope with encrypted fields", async () => {
      const expectedSalt = Buffer.from("salt1234", "utf8");
      const expectedIv = Buffer.from("iv12345678901234", "utf8");
      const expectedAuthTag = Buffer.from("auth-tag-16", "utf8");
      const expectedCiphertext = Buffer.from("encrypted-data", "utf8");

      mockEncryptBackup.mockReturnValueOnce({
        salt: expectedSalt,
        iv: expectedIv,
        authTag: expectedAuthTag,
        ciphertext: expectedCiphertext,
      });

      const envelope = await serializeFullBackup(sampleSettings, "my-password");

      expect(envelope.format).toBe("suyan-ai-settings");
      expect(envelope.formatVersion).toBe(2);
      expect(envelope.kdf).toBe("scrypt");
      expect(typeof envelope.salt).toBe("string");
      expect(typeof envelope.iv).toBe("string");
      expect(typeof envelope.authTag).toBe("string");
      expect(typeof envelope.ciphertext).toBe("string");
      expect(typeof envelope.exportedAt).toBe("string");
    });

    it("calls encryptBackup with the plain payload JSON", async () => {
      mockEncryptBackup.mockReturnValueOnce({
        salt: Buffer.from("s"),
        iv: Buffer.from("iv"),
        authTag: Buffer.from("at"),
        ciphertext: Buffer.from("ct"),
      });

      await serializeFullBackup(sampleSettings, "test-pw");

      expect(mockEncryptBackup).toHaveBeenCalledTimes(1);
      const [plaintext] = mockEncryptBackup.mock.calls[0];
      expect(typeof plaintext).toBe("string");
      const parsed = JSON.parse(plaintext) as Record<string, unknown>;
      expect(parsed.format).toBe("suyan-ai-settings");
      expect(parsed.formatVersion).toBe(1);
    });
  });

  describe("parseBackupFile", () => {
    it("parses formatVersion 1 plain JSON", () => {
      const plainBackup = serializePlainBackup(sampleSettings);
      const text = JSON.stringify(plainBackup);
      const result = parseBackupFile(text);

      expect(result.ok).toBe(true);
      expect(result.data?.formatVersion).toBe(1);
    });

    it("parses formatVersion 2 encrypted backup", async () => {
      const plainBackup = serializePlainBackup(sampleSettings);
      const plainText = JSON.stringify(plainBackup);
      const fakeCiphertext = Buffer.from("fake-ciphertext-data", "utf8");

      mockEncryptBackup.mockReturnValueOnce({
        salt: Buffer.from("test-salt"),
        iv: Buffer.from("test-iv-16bytes!"),
        authTag: Buffer.from("test-auth-tag!"),
        ciphertext: fakeCiphertext,
      });

      const envelope = await serializeFullBackup(sampleSettings, "password");
      const envelopeText = JSON.stringify(envelope);

      mockDecryptBackup.mockReturnValueOnce(plainText);

      const result = parseBackupFile(envelopeText, "password");

      expect(result.ok).toBe(true);
      expect(result.data?.formatVersion).toBe(1);
      expect(mockDecryptBackup).toHaveBeenCalledTimes(1);
    });

    it("returns error for unknown format", () => {
      const text = JSON.stringify({
        format: "unknown-format",
        formatVersion: 1,
      });
      const result = parseBackupFile(text);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(
        "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
      );
    });

    it("returns error for unsupported version", () => {
      const text = JSON.stringify({
        format: "suyan-ai-settings",
        formatVersion: 99,
      });
      const result = parseBackupFile(text);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(
        "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
      );
    });

    it("returns error for invalid JSON", () => {
      const result = parseBackupFile("this is not valid JSON");

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(
        "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
      );
    });

    it("returns error when password missing for encrypted backup", async () => {
      mockEncryptBackup.mockReturnValueOnce({
        salt: Buffer.from("s"),
        iv: Buffer.from("iv"),
        authTag: Buffer.from("at"),
        ciphertext: Buffer.from("ct"),
      });

      const envelope = await serializeFullBackup(sampleSettings, "pw");
      const result = parseBackupFile(JSON.stringify(envelope));

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("AI_SETTINGS_BACKUP_DECRYPT_FAILED");
    });

    it("returns error when decrypt fails (wrong password)", async () => {
      mockEncryptBackup.mockReturnValueOnce({
        salt: Buffer.from("s"),
        iv: Buffer.from("iv"),
        authTag: Buffer.from("at"),
        ciphertext: Buffer.from("ct"),
      });

      const envelope = await serializeFullBackup(sampleSettings, "correct");

      mockDecryptBackup.mockImplementationOnce(() => {
        const err = new Error("decrypt failed") as Error & {
          code: string;
        };
        err.code = "AI_SETTINGS_BACKUP_DECRYPT_FAILED";
        throw err;
      });

      const result = parseBackupFile(
        JSON.stringify(envelope),
        "wrong-password",
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("AI_SETTINGS_BACKUP_DECRYPT_FAILED");
    });
  });

  describe("migrateBackupPayload", () => {
    it("adds missing actionPreferences and recognitionSourcePreferences", () => {
      const legacy = {
        profiles: [
          {
            id: "default",
            name: "默认 API",
            enabled: false,
            baseUrl: "https://api.openai.com/v1",
            apiKey: "",
            model: "gpt-4.1-mini",
            models: [
              {
                id: "gpt-4.1-mini",
                label: "gpt-4.1-mini",
                capabilities: ["text", "vision"],
              },
            ],
          },
        ],
      };

      const migrated = migrateBackupPayload(legacy);

      expect(migrated.actionPreferences).toEqual({});
      expect(migrated.recognitionSourcePreferences).toEqual({});
      expect(migrated.profiles).toHaveLength(1);
    });

    it("preserves existing actionPreferences and recognitionSourcePreferences", () => {
      const payload = {
        profiles: [
          {
            id: "p1",
            name: "API",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "",
            model: "gpt-4",
          },
        ],
        actionPreferences: {
          "prompt-translation": {
            profileId: "p1",
            modelId: "gpt-4",
          },
        },
        recognitionSourcePreferences: {
          tags: "prompt",
        },
      };

      const migrated = migrateBackupPayload(payload);

      expect(migrated.actionPreferences).toEqual({
        "prompt-translation": { profileId: "p1", modelId: "gpt-4" },
      });
      expect(migrated.recognitionSourcePreferences).toEqual({
        tags: "prompt",
      });
    });
  });

  describe("round-trip", () => {
    it("plain export → parse returns identical structure", () => {
      const plainBackup = serializePlainBackup(sampleSettings);
      const text = JSON.stringify(plainBackup);
      const result = parseBackupFile(text);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(plainBackup);
    });

    it("encrypted export → decrypt → parse returns identical structure", async () => {
      const plainBackup = serializePlainBackup(sampleSettings);
      const plainText = JSON.stringify(plainBackup);

      mockEncryptBackup.mockReturnValueOnce({
        salt: Buffer.from("round-trip-salt"),
        iv: Buffer.from("round-trip-iv!!"),
        authTag: Buffer.from("round-trip-tag!"),
        ciphertext: Buffer.from("round-trip-ciphertext"),
      });

      const envelope = await serializeFullBackup(sampleSettings, "rt-password");

      mockDecryptBackup.mockReturnValueOnce(plainText);

      const result = parseBackupFile(
        JSON.stringify(envelope),
        "rt-password",
      );

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(plainBackup);
    });
  });

  describe("validation", () => {
    it("rejects backup with invalid JSON", () => {
      const result = parseBackupFile("{invalid json");

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(
        "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
      );
    });

    it("accepts well-formed backup with valid profiles", () => {
      const backup = serializePlainBackup(sampleSettings);
      const result = parseBackupFile(JSON.stringify(backup));

      expect(result.ok).toBe(true);
      expect(result.data?.profiles).toHaveLength(2);
    });
  });
});
