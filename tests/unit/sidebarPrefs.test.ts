import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStoredSidebarOpen,
  getStoredSidebarWidth,
  storeSidebarOpen,
  storeSidebarWidth,
} from "@/features/library/utils/sidebarPrefs";

function stubLocalStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));

  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    },
  });

  return values;
}

describe("sidebarPrefs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to an open sidebar when no preference was stored", () => {
    stubLocalStorage();

    expect(getStoredSidebarOpen()).toBe(true);
  });

  it("restores the last sidebar open state", () => {
    const values = stubLocalStorage();

    storeSidebarOpen(false);
    expect(values.get("library-sidebar:open")).toBe("false");
    expect(getStoredSidebarOpen()).toBe(false);

    storeSidebarOpen(true);
    expect(values.get("library-sidebar:open")).toBe("true");
    expect(getStoredSidebarOpen()).toBe(true);
  });

  it("restores a stored width and falls back for invalid values", () => {
    const values = stubLocalStorage({ "library-sidebar:width": "288" });

    expect(getStoredSidebarWidth(240)).toBe(288);

    values.set("library-sidebar:width", "not-a-number");
    expect(getStoredSidebarWidth(240)).toBe(240);
  });

  it("stores rounded positive sidebar widths", () => {
    const values = stubLocalStorage();

    storeSidebarWidth(271.6);

    expect(values.get("library-sidebar:width")).toBe("272");
  });
});
