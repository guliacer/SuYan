import fs from "node:fs";
import { describe, expect, it } from "vitest";

const view = fs.readFileSync("src/features/library/components/LibraryView.tsx", "utf8");
const sidebar = fs.readFileSync("src/features/library/utils/sidebarEntries.ts", "utf8");

describe("gallery directory entry", () => {
  it("exposes directory browse from the persistent left navigation", () => {
    const groups = sidebar.slice(sidebar.indexOf("export const sidebarEntryGroups"), sidebar.indexOf("export const sidebarFooterEntryIds"));
    expect(groups).toContain('"libraryRoots"');
    expect(view).toContain("onOpenLibraryRoots={() => setIsLibraryRootsOpen(true)}");
    expect(view).toContain("isLibraryRootsOpen={isLibraryRootsOpen}");
    expect(view).toContain("active={isLibraryRootsOpen}");
    expect(view).toContain('label={t("目录浏览")}');
  });

  it("does not duplicate directory browse in the gallery toolbar", () => {
    const toolbar = view.slice(view.indexOf("type GalleryToolbarProps"), view.indexOf("type SortControlPanelProps"));
    expect(toolbar).not.toContain("onOpenDirectoryMode");
    expect(toolbar).not.toContain('data-feature-guide="gallery-directory"');
  });
});
