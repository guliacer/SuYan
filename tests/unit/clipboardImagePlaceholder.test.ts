import { describe, expect, it } from "vitest";
import {
  buildImportedPromptPlaceholderSeed,
  createImportedPromptPlaceholderImage,
} from "../../electron/main/library/defaultLibrarySeed";

describe("clipboard prompt placeholder", () => {
  it("uses persisted title and prompt as a reproducible placeholder seed", () => {
    const title = "扶栏空中秋主题写真";
    const parsedPrompt = "主体物：扶栏\n画面构图：横幅";

    const writerSeed = buildImportedPromptPlaceholderSeed(title, parsedPrompt);
    const detectorSeed = buildImportedPromptPlaceholderSeed(title, parsedPrompt);

    expect(writerSeed).toBe(`${title}\n${parsedPrompt}\n${parsedPrompt}`);
    expect(createImportedPromptPlaceholderImage(writerSeed)).toEqual(
      createImportedPromptPlaceholderImage(detectorSeed),
    );
  });

  it("does not depend on the original clipboard formatting", () => {
    const title = "标题";
    const prompt = "主体：人物\n构图：近景";
    const originalClipboardText = "标题：标题\n提示词：\n主体：人物\n构图：近景";

    const seed = buildImportedPromptPlaceholderSeed(title, prompt);

    expect(seed).toBe("标题\n主体：人物\n构图：近景\n主体：人物\n构图：近景");
    expect(seed).not.toContain(originalClipboardText);
  });
});
