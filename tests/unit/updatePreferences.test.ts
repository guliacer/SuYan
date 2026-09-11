import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "W:/suyan-test-data",
    isPackaged: false,
  },
  dialog: {},
  shell: {},
}));

import {
  defaultAppUpdatePreferences,
  normalizeAppUpdatePreferences,
} from "../../electron/main/app/updatePreferences";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("app update preferences", () => {
  it("defaults to automatic update checks", () => {
    expect(normalizeAppUpdatePreferences(null)).toEqual(defaultAppUpdatePreferences);
  });

  it("normalizes an ignored release version", () => {
    expect(
      normalizeAppUpdatePreferences({
        automaticCheck: true,
        ignoredVersion: " v0.4.2 ",
      }),
    ).toEqual({
      automaticCheck: true,
      ignoredVersion: "0.4.2",
    });
  });

  it("preserves the permanent opt-out and rejects invalid ignored versions", () => {
    expect(
      normalizeAppUpdatePreferences({
        automaticCheck: false,
        ignoredVersion: 42,
      }),
    ).toEqual({
      automaticCheck: false,
      ignoredVersion: null,
    });
  });

  it("falls back to enabled checks for invalid preference data", () => {
    expect(normalizeAppUpdatePreferences("invalid")).toEqual({
      automaticCheck: true,
      ignoredVersion: null,
    });
  });
});
