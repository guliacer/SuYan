import fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as viewer from "../../src/features/library/components/LibraryMediaViewer";
const focusTarget = (targets: string[], current: string | null, reverse: boolean) =>
  (viewer as typeof viewer & { getLibraryMediaViewerTabFocusTarget: (targets: string[], current: string | null, reverse: boolean) => string | null }).getLibraryMediaViewerTabFocusTarget(targets, current, reverse);
describe("viewer keyboard focus boundary", () => {
  it("wraps forward tab from the last control to the first", () => expect(focusTarget(["close", "edit", "export"], "export", false)).toBe("close"));
  it("wraps reverse tab from the first control to the last", () => expect(focusTarget(["close", "edit", "export"], "close", true)).toBe("export"));
  it("leaves normal interior tab movement to the browser", () => expect(focusTarget(["close", "edit", "export"], "edit", false)).toBeNull());
  it("starts inside the viewer when its container has focus", () => { expect(focusTarget(["close", "export"], null, false)).toBe("close"); expect(focusTarget(["close", "export"], null, true)).toBe("export"); });
  it("handles an empty focusable list without inventing a target", () => expect(focusTarget([], null, false)).toBeNull());
  it("traps Tab before ignoring editable controls and leaves nested portals alone", () => {
    const source = fs.readFileSync("src/features/library/components/LibraryMediaViewer.tsx", "utf8");
    const handler = source.slice(source.indexOf("const handleKeyDown ="), source.indexOf("const content ="));
    expect(handler.includes('event.key === "Tab"')).toBe(true);
    expect(handler.indexOf('event.key === "Tab"')).toBeLessThan(handler.indexOf("isLibraryMediaViewerEditableTarget(event.target)"));
    expect(handler.includes("target.closest")).toBe(true);
  });
});
