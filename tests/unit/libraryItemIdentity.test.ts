import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import { reconcileItemsByIdentity } from "@/features/library/utils/libraryItemIdentity";

describe("library item identity reconciliation", () => {
  it("does not reuse an item when external source health changes", () => {
    const available = makeExternalItem("available");
    const missing = makeExternalItem("missing");
    const stats = { reused: 0, changed: 0, added: 0 };

    const reconciled = reconcileItemsByIdentity([available], [missing], stats);

    expect(reconciled[0]).toBe(missing);
    expect(reconciled[0]).not.toBe(available);
    expect(reconciled[0].mediaStorage).toMatchObject({ status: "missing" });
    expect(stats).toEqual({ reused: 0, changed: 1, added: 0 });
  });

  it("still reuses semantically identical managed items", () => {
    const previous = makeManagedItem();
    const next = { ...previous, mediaStorage: "managed" as const };

    const reconciled = reconcileItemsByIdentity([previous], [next]);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toBe(previous);
  });
});

function makeExternalItem(status: "available" | "missing"): LibraryItem {
  return {
    ...makeManagedItem(),
    mediaStorage: {
      kind: "external",
      rootId: "root-1",
      relativePath: "source.png",
      size: status === "available" ? 128 : null,
      mtimeMs: status === "available" ? 1234 : null,
      status,
    },
  };
}

function makeManagedItem(): LibraryItem {
  return {
    id: "item-1",
    title: "素材",
    imageFileName: "item-1.png",
    prompt: "",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}
