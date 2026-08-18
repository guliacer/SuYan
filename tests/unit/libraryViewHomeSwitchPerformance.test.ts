import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const libraryViewSource = readFileSync(
  "src/features/library/components/LibraryView.tsx",
  "utf8",
);

describe("LibraryView home switch performance", () => {
  it("keeps prewarmed lexicon workspaces mounted but hidden across canvas, web assistant and home", () => {
    expect(libraryViewSource).toContain(
      '(mainView !== "home" && mainView !== "canvas" && mainView !== "webAssistant") || mountedLexiconViews.size > 0',
    );
    expect(libraryViewSource).toContain(
      'mainView === "home" || mainView === "canvas" || mainView === "webAssistant" ? "hidden" : ""',
    );
  });

  it("memoizes lexicon workspaces and passes stable persistence callbacks", () => {
    expect(libraryViewSource).toContain(
      "const PromptLexiconWorkspace = memo(function PromptLexiconWorkspace",
    );
    expect(libraryViewSource).toContain(
      "const handleSavePromptLexiconItem = useCallback(",
    );
    expect(libraryViewSource).toContain(
      "const handleSavePromptLexiconItemsBatch = useCallback(",
    );
    expect(libraryViewSource).toContain(
      "const handleMovePromptGroupsToCategory = useCallback(",
    );
    expect(libraryViewSource).toContain(
      "onSaveItem={handleSavePromptLexiconItem}",
    );
    expect(libraryViewSource).toContain(
      "onSaveItemsBatch={handleSavePromptLexiconItemsBatch}",
    );
    expect(libraryViewSource).toContain(
      "onMovePromptGroupsToCategory={handleMovePromptGroupsToCategory}",
    );
  });
});
