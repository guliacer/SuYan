import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSearchHeroPanelSource(): string {
  const source = fs.readFileSync(
    path.join(projectRoot, "src", "features", "library", "components", "LibraryView.tsx"),
    "utf8",
  );
  const match = source.match(/type SearchHeroPanelProps[\s\S]*?\nfunction clampMasonryColumnCount/);

  expect(match).not.toBeNull();

  return match?.[0] ?? "";
}

describe("LibraryView SearchHeroPanel", () => {
  it("keeps the home search panel limited to the search box", () => {
    const panelSource = readSearchHeroPanelSource();

    expect(panelSource).toContain('id="prompt-library-search"');
    expect(panelSource).not.toContain("MaterialDirectoryFilter");
    expect(panelSource).not.toContain("素材目录");
    expect(panelSource).not.toContain("全部类型");
    expect(panelSource).not.toContain("全部来源");
    expect(panelSource).not.toContain("onPromptTypeChange");
    expect(panelSource).not.toContain("onSourceKindChange");
    expect(panelSource).not.toContain("onCategoryChange");
  });
});
