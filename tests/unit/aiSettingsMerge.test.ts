import { describe, expect, it } from "vitest";
import type {
  AiProviderSettings,
  AiProviderSettingsCollection,
} from "../../electron/main/ai/aiSettingsModel";
import { mergeBackupIntoCurrent } from "../../electron/main/ai/aiSettingsMerge";

function makeProfile(overrides: Partial<AiProviderSettings> & { id: string }): AiProviderSettings {
  return {
    name: overrides.id,
    enabled: false,
    baseUrl: "https://api.example.com/v1",
    apiKey: "",
    model: "gpt-4",
    models: [{ id: "gpt-4", label: "gpt-4", capabilities: ["text"] }],
    ...overrides,
  };
}

function makeCollection(profiles: AiProviderSettings[]): AiProviderSettingsCollection {
  return {
    activeProfileId: profiles[0]?.id ?? "default",
    actionPreferences: {},
    recognitionSourcePreferences: {},
    profiles,
  };
}

describe("mergeBackupIntoCurrent", () => {
  describe("merge mode (default)", () => {
    it("overwrites matched profile fields by id", () => {
      const current = makeCollection([makeProfile({ id: "p1", name: "Original", baseUrl: "https://old.com/v1" })]);
      const backup = makeCollection([makeProfile({ id: "p1", name: "Updated", baseUrl: "https://new.com/v1", apiKey: "sk-new" })]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].name).toBe("Updated");
      expect(result.profiles[0].baseUrl).toBe("https://new.com/v1");
      expect(result.profiles[0].apiKey).toBe("sk-new");
    });

    it("adds new profiles from backup that have no match", () => {
      const current = makeCollection([makeProfile({ id: "p1" })]);
      const backup = makeCollection([
        makeProfile({ id: "p1", name: "Keep" }),
        makeProfile({ id: "p2", name: "New Provider" }),
      ]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.profiles).toHaveLength(2);
      expect(result.profiles[1].id).toBe("p2");
      expect(result.profiles[1].name).toBe("New Provider");
    });

    it("matches by baseUrl when id differs", () => {
      const current = makeCollection([makeProfile({ id: "old-id", baseUrl: "https://shared.com/v1", name: "A" })]);
      const backup = makeCollection([makeProfile({ id: "new-id", baseUrl: "https://shared.com/v1", name: "B" })]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].id).toBe("new-id");
      expect(result.profiles[0].name).toBe("B");
    });

    it("matches by name when id and baseUrl both differ", () => {
      const current = makeCollection([makeProfile({ id: "id-a", baseUrl: "https://a.com/v1", name: "MyProvider" })]);
      const backup = makeCollection([makeProfile({ id: "id-b", baseUrl: "https://b.com/v1", name: "MyProvider" })]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].id).toBe("id-b");
      expect(result.profiles[0].baseUrl).toBe("https://b.com/v1");
    });

    it("takes backup actionOrder", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        actionOrder: ["prompt-category", "prompt-tags"],
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        actionOrder: ["image-reverse", "prompt-translation"],
      };

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.actionOrder).toEqual(["image-reverse", "prompt-translation"]);
    });

    it("takes backup recognitionSourcePreferences", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        recognitionSourcePreferences: { category: "prompt" },
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        recognitionSourcePreferences: { category: "image", tags: "image" },
      };

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.recognitionSourcePreferences).toEqual({ category: "image", tags: "image" });
    });

    it("normalizes actionPreferences by profile existence after merge", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        actionPreferences: {
          "prompt-category": { profileId: "p1", modelId: "gpt-4" },
          "prompt-tags": { profileId: "p-vanished" },
        },
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" }), makeProfile({ id: "p2" })]),
        actionPreferences: {
          "prompt-category": { profileId: "p2", modelId: "gpt-4" },
        },
      };

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.actionPreferences["prompt-category"]?.profileId).toBe("p2");
      expect(result.actionPreferences["prompt-tags"]).toBeUndefined();
    });

    it("preserves current activeProfileId if still valid", () => {
      const current = makeCollection([
        makeProfile({ id: "p1" }),
        makeProfile({ id: "p2" }),
      ]);
      current.activeProfileId = "p2";
      const backup = makeCollection([makeProfile({ id: "p1" })]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.activeProfileId).toBe("p2");
    });

    it("falls back to first profile if activeProfileId vanishes", () => {
      const current = makeCollection([makeProfile({ id: "vanish" })]);
      current.activeProfileId = "vanish";
      const backup = makeCollection([makeProfile({ id: "keeper" })]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.activeProfileId).toBe("keeper");
    });

    it("always passes validateAiProviderSettingsCollection", () => {
      const current = makeCollection([makeProfile({ id: "p1" })]);
      const backup = makeCollection([
        makeProfile({ id: "p1", apiKey: "sk-real" }),
        makeProfile({ id: "p2" }),
      ]);

      const result = mergeBackupIntoCurrent(current, backup, "merge");

      expect(result.profiles.length).toBeGreaterThan(0);
      for (const profile of result.profiles) {
        expect(profile.id).toBeTruthy();
        expect(profile.baseUrl).toBeTruthy();
      }
    });
  });

  describe("replace mode", () => {
    it("replaces profiles with backup profiles", () => {
      const current = makeCollection([
        makeProfile({ id: "old", name: "Old Provider" }),
      ]);
      const backup = makeCollection([makeProfile({ id: "new", name: "New Provider" })]);

      const result = mergeBackupIntoCurrent(current, backup, "replace");

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].id).toBe("new");
      expect(result.profiles[0].name).toBe("New Provider");
    });

    it("keeps current actionPreferences (non-destructive default)", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "old" })]),
        actionPreferences: { "prompt-category": { profileId: "old" } },
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "new" })]),
        actionPreferences: { "prompt-category": { profileId: "new" } },
      };

      const result = mergeBackupIntoCurrent(current, backup, "replace");

      expect(result.actionPreferences).toEqual({ "prompt-category": { profileId: "old" } });
    });

    it("keeps current recognitionSourcePreferences (non-destructive default)", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "old" })]),
        recognitionSourcePreferences: { category: "prompt" },
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "new" })]),
        recognitionSourcePreferences: { category: "image" },
      };

      const result = mergeBackupIntoCurrent(current, backup, "replace");

      expect(result.recognitionSourcePreferences).toEqual({ category: "prompt" });
    });

    it("keeps current actionOrder (non-destructive default)", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "old" })]),
        actionOrder: ["prompt-category"],
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "new" })]),
        actionOrder: ["image-reverse"],
      };

      const result = mergeBackupIntoCurrent(current, backup, "replace");

      expect(result.actionOrder).toEqual(["prompt-category"]);
    });

    it("still passes validateAiProviderSettingsCollection", () => {
      const current = makeCollection([makeProfile({ id: "old" })]);
      const backup = makeCollection([makeProfile({ id: "new" })]);

      const result = mergeBackupIntoCurrent(current, backup, "replace");

      expect(result.profiles.length).toBeGreaterThan(0);
    });
  });

  describe("add-new mode", () => {
    it("only adds profiles not matching any existing id/baseUrl/name", () => {
      const current = makeCollection([
        makeProfile({ id: "p1", baseUrl: "https://a.com/v1", name: "A" }),
      ]);
      const backup = makeCollection([
        makeProfile({ id: "p1", baseUrl: "https://a.com/v1", name: "A" }),
        makeProfile({ id: "p2", baseUrl: "https://b.com/v1", name: "B" }),
      ]);

      const result = mergeBackupIntoCurrent(current, backup, "add-new");

      expect(result.profiles).toHaveLength(2);
      expect(result.profiles[1].id).toBe("p2");
    });

    it("does not overwrite existing profile fields", () => {
      const current = makeCollection([
        makeProfile({ id: "p1", name: "Original", apiKey: "sk-keep" }),
      ]);
      const backup = makeCollection([
        makeProfile({ id: "p1", name: "Should Not Change" }),
      ]);

      const result = mergeBackupIntoCurrent(current, backup, "add-new");

      expect(result.profiles[0].name).toBe("Original");
      expect(result.profiles[0].apiKey).toBe("sk-keep");
    });

    it("does NOT import actionPreferences", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        actionPreferences: { "prompt-category": { profileId: "p1" } },
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" }), makeProfile({ id: "p2" })]),
        actionPreferences: { "prompt-category": { profileId: "p2" } },
      };

      const result = mergeBackupIntoCurrent(current, backup, "add-new");

      expect(result.actionPreferences).toEqual({ "prompt-category": { profileId: "p1" } });
    });

    it("does NOT import recognitionSourcePreferences", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        recognitionSourcePreferences: { category: "prompt" },
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" }), makeProfile({ id: "p2" })]),
        recognitionSourcePreferences: { category: "image" },
      };

      const result = mergeBackupIntoCurrent(current, backup, "add-new");

      expect(result.recognitionSourcePreferences).toEqual({ category: "prompt" });
    });

    it("does NOT import actionOrder", () => {
      const current: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" })]),
        actionOrder: ["prompt-category"],
      };
      const backup: AiProviderSettingsCollection = {
        ...makeCollection([makeProfile({ id: "p1" }), makeProfile({ id: "p2" })]),
        actionOrder: ["image-reverse"],
      };

      const result = mergeBackupIntoCurrent(current, backup, "add-new");

      expect(result.actionOrder).toEqual(["prompt-category"]);
    });

    it("still passes validateAiProviderSettingsCollection", () => {
      const current = makeCollection([makeProfile({ id: "p1" })]);
      const backup = makeCollection([makeProfile({ id: "p2" })]);

      const result = mergeBackupIntoCurrent(current, backup, "add-new");

      expect(result.profiles.length).toBeGreaterThan(0);
    });
  });

  describe("validation rejection", () => {
    it("throws when backup profile has no valid id/baseUrl/name after normalize", () => {
      const current = makeCollection([makeProfile({ id: "p1" })]);
      const backup: AiProviderSettingsCollection = {
        activeProfileId: "bad",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "",
            name: "",
            enabled: true,
            baseUrl: "",
            apiKey: "",
            model: "",
            models: [],
          },
        ],
      };

      expect(() => mergeBackupIntoCurrent(current, backup, "merge")).toThrow();
    });

    it("handles empty current and backup gracefully", () => {
      const backup: AiProviderSettingsCollection = {
        activeProfileId: "",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [],
      };
      const currentRaw: AiProviderSettingsCollection = {
        activeProfileId: "",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [],
      };

      const result = mergeBackupIntoCurrent(currentRaw, backup, "merge");

      expect(result.profiles.length).toBeGreaterThan(0);
    });
  });

  describe("idempotency", () => {
    it("merging same backup twice produces same result", () => {
      const current = makeCollection([makeProfile({ id: "p1" })]);
      const backup = makeCollection([makeProfile({ id: "p1", name: "V2" }), makeProfile({ id: "p2" })]);

      const first = mergeBackupIntoCurrent(current, backup, "merge");
      const second = mergeBackupIntoCurrent(first, backup, "merge");

      expect(second.profiles).toHaveLength(2);
      expect(second.profiles[0].name).toBe("V2");
      expect(second.profiles[1].id).toBe("p2");
    });
  });
});
